package ai.ganegime.app

import android.car.Car
import android.car.VehiclePropertyIds
import android.car.hardware.CarPropertyValue
import android.car.hardware.property.CarPropertyManager
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import java.util.concurrent.Executors

/** Reads AAOS vehicle properties on Pleos; never writes vehicle state. */
class DrivingGuard(context: Context, private val changed: (String)->Unit) {
    private val ui=Handler(Looper.getMainLooper())
    private val reader=Executors.newSingleThreadExecutor()
    private val policy=ParkingPolicy()
    private var car: Car?=null
    private var manager: CarPropertyManager?=null
    private var active=false
    private var closed=false
    private var generation=0
    private var reading=false
    private var lastState=""
    private var speedTimestamp=-1L
    private var gearTimestamp=-1L
    @Volatile private var allowUntil=0L
    val allowed:Boolean get()=SystemClock.elapsedRealtime()<allowUntil
    private fun publish() {
        val state=if(active && manager!=null)policy.state(SystemClock.elapsedRealtime()) else "unknown"
        // A blocked main loop cannot leave a stale bridge/keyboard authorization open.
        allowUntil=if(state=="parked")SystemClock.elapsedRealtime()+500 else 0
        if(state!=lastState){lastState=state;changed(state)}
    }
    private fun receive(value:CarPropertyValue<*>?) {
        if(!active || manager==null || value==null)return
        val now=SystemClock.elapsedRealtime()
        val valid=value.status==CarPropertyValue.STATUS_AVAILABLE
        if(!valid){fail(value.propertyId);return}
        when(value.propertyId) {
            VehiclePropertyIds.PERF_VEHICLE_SPEED -> {
                if(value.timestamp<speedTimestamp)return
                speedTimestamp=value.timestamp
                // Continuous speed must have a recent VHAL timestamp, even if a cached read succeeds.
                val age=SystemClock.elapsedRealtimeNanos()-value.timestamp
                policy.speed(if(valid && age in 0..ParkingPolicy.FRESH_MS*1000000) value.value as? Float else null,now)
            }
            VehiclePropertyIds.GEAR_SELECTION -> {
                if(value.timestamp<gearTimestamp)return
                gearTimestamp=value.timestamp
                // Gear is ON_CHANGE. A successful periodic get confirms availability without requiring a shift.
                policy.gear(if(valid)value.value as? Int else null,now)
            }
        }
        publish()
    }
    private fun fail(property:Int) {
        if(!active)return
        if(property==VehiclePropertyIds.PERF_VEHICLE_SPEED)policy.speed(null,SystemClock.elapsedRealtime())
        else policy.gear(null,SystemClock.elapsedRealtime())
        publish()
    }
    private val callback=object:CarPropertyManager.CarPropertyEventCallback {
        override fun onChangeEvent(value:CarPropertyValue<*>) { receive(value) }
        override fun onErrorEvent(propertyId:Int, areaId:Int) {fail(propertyId)}
    }
    private val tick=object:Runnable {
        override fun run() {
            if(closed)return
            publish()
            val m=manager
            if(active && m!=null && !reading) {
                reading=true;val run=generation
                reader.execute {
                    val speed=runCatching {m.getProperty<Float>(VehiclePropertyIds.PERF_VEHICLE_SPEED,0)}.getOrNull()
                    val gear=runCatching {m.getProperty<Int>(VehiclePropertyIds.GEAR_SELECTION,0)}.getOrNull()
                    ui.post {
                        reading=false
                        if(!closed && active && generation==run) {
                            if(speed==null)fail(VehiclePropertyIds.PERF_VEHICLE_SPEED) else receive(speed)
                            if(gear==null)fail(VehiclePropertyIds.GEAR_SELECTION) else receive(gear)
                        }
                    }
                }
            }
            ui.postDelayed(this,250)
        }
    }
    init {
        publish();ui.post(tick)
        try {
            car=Car.createCar(context,ui,Car.CAR_WAIT_TIMEOUT_DO_NOT_WAIT) { service,ready ->
                generation++;policy.reset();speedTimestamp=-1;gearTimestamp=-1
                manager=if(ready)runCatching {service.getCarManager(Car.PROPERTY_SERVICE) as CarPropertyManager}.getOrNull() else null
                if(active)subscribe()
                publish()
            }
        }catch(_:Exception){manager=null;publish()}
    }
    private fun subscribe() {
        try {
            val m=manager?:return
            m.unregisterCallback(callback)
            val speed=m.registerCallback(callback,VehiclePropertyIds.PERF_VEHICLE_SPEED,5f)
            val gear=m.registerCallback(callback,VehiclePropertyIds.GEAR_SELECTION,CarPropertyManager.SENSOR_RATE_ONCHANGE)
            if(!speed || !gear){policy.reset();publish()}
        }catch(_:Exception){policy.reset();publish()}
    }
    fun resume() {active=true;generation++;policy.reset();publish();subscribe()}
    fun pause() {active=false;generation++;policy.reset();publish();runCatching {manager?.unregisterCallback(callback)}}
    fun close() {pause();closed=true;ui.removeCallbacksAndMessages(null);reader.shutdownNow();runCatching{car?.disconnect()}}
}
