package ai.ganegime.app

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.*
import ai.pleos.playground.navi.helper.NaviHelper
import ai.pleos.playground.navi.helper.listener.NaviHelperEventListener
import ai.pleos.playground.navi.constants.*
import ai.pleos.playground.navi.data.*
import org.json.JSONObject
import org.json.JSONArray
import kotlin.math.abs
import android.view.View
import android.view.Gravity
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.graphics.Color
import android.graphics.Typeface
import android.content.pm.PackageManager

class MainActivity : Activity() {
    lateinit var web: WebView
    private lateinit var drivingGuard: DrivingGuard
    private lateinit var lockPanel: LinearLayout
    private lateinit var lockTitle: TextView
    private lateinit var lockDetail: TextView
    @Volatile var drivingState="unknown"
        private set
    fun inputAllowed()=::drivingGuard.isInitialized && drivingGuard.allowed
    private fun applyDrivingState(state:String) {
        drivingState=state
        val parked=state=="parked"
        lockTitle.text=when(state){"moving"->"주행 중에는 조작할 수 없어요";"not_parked"->"주차 후에 이용해 주세요";"confirming"->"정차 상태를 확인하고 있어요";else->"차량 상태를 확인하고 있어요"}
        lockDetail.text=if(state=="unknown") {
            if(checkSelfPermission("android.car.permission.CAR_SPEED")!=PackageManager.PERMISSION_GRANTED)
                "차량 속도 권한이 필요해요.\n시스템 설정에서 권한을 허용한 뒤 앱을 다시 열어 주세요."
            else "차량의 속도와 기어를 확인할 수 없어 입력을 잠갔어요.\n연결이 확인되면 자동으로 다시 확인합니다."
        } else "안전한 곳에 정차하고 기어를 P에 두세요.\n입력하던 일정은 그대로 유지됩니다."
        web.visibility=if(parked)View.VISIBLE else View.INVISIBLE
        web.importantForAccessibility=if(parked)View.IMPORTANT_FOR_ACCESSIBILITY_AUTO else View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        lockPanel.visibility=if(parked)View.GONE else View.VISIBLE
        if(!parked) {
            (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(web.windowToken,0)
            web.clearFocus();lockPanel.requestFocus()
            if(::liveBridge.isInitialized)liveBridge.dismissConfiguration()
            // A route waiting for the navigation provider must not be sent after driving starts.
            if(phase=="preparing"){requestGeneration++;deferredRoute=null;pending=false;status("ignored","주차 후 내비 전송을 다시 눌러 주세요.")}
        }
        web.evaluateJavascript("document.documentElement.inert=${!parked};${if(!parked)"document.activeElement?.blur();" else ""}",null)
    }
    private lateinit var helper: NaviHelper
    private lateinit var liveBridge: LiveBridge
    private val ui = Handler(Looper.getMainLooper())
    private var ready = false
    private var pending = false
    private var requestGeneration = 0
    private var deferredRoute: (() -> Unit)? = null
    private var expected: List<Point> = emptyList()
    private var destinationMatches = false
    private var waypointsMatch = false
    private var routeCompleted = false
    private var routeStarted = false
    private var waypointVerification = "none"
    @Volatile private var snapshot = "{}"
    private val events = mutableListOf<String>()
    private var phase = "connecting"
    private var message = "Pleos 내비 서비스에 연결 중"
    data class Point(val name: String, val lat: Double, val lon: Double, val poiId: String, val address: String)

    // Diagnostics contain only fixed event codes and stay in bounded process memory.
    // Never append caller payloads, SDK objects, exception messages, or place data.
    private fun event(kind: String) {
        val safeKind = if (kind in setOf("connecting", "ready", "unavailable", "error", "verified", "requested", "preparing", "timeout", "ignored", "providerReady", "onRoutingCompleted", "onRouteStarted", "onDestinationInfo", "onWayPointInfo", "waypointVerification", "onRouteCancelled", "onNavigationStatus")) kind else "navigationEvent"
        val line = "${System.currentTimeMillis()} $safeKind"
        events.add(line)
        if (events.size > 80) events.removeAt(0)
        publish()
    }
    private fun publish() {
        snapshot = JSONObject().put("ready",ready).put("pending",pending).put("phase",phase).put("message",message)
            .put("destinationMatches",destinationMatches).put("waypointsMatch",waypointsMatch)
            .put("routeCompleted",routeCompleted).put("routeStarted",routeStarted).put("waypointVerification",waypointVerification).put("events",JSONArray(events)).toString()
        if (::web.isInitialized) web.evaluateJavascript("window.onPleosStatus && window.onPleosStatus($snapshot)",null)
    }
    private fun status(p: String, m: String) { phase=p; message=m; event(p) }
    private fun readback() { if (ready && pending) { helper.getDestinationInfo(); helper.getWaypointInfo() } }
    private fun verify() {
        if (pending && phase=="requested" && (routeCompleted || routeStarted) && destinationMatches && waypointsMatch) {
            pending=false; status("verified","목적지와 경유 순서를 확인했습니다.")
        } else publish()
    }
    private fun match(p:Point, lat:Double,lon:Double)=abs(p.lat-lat)<0.0003 && abs(p.lon-lon)<0.0003
    private val listener = object:NaviHelperEventListener {
        override fun onRouteStateInfo(routeStateInfo:RouteStateInfo) { ui.post {
            if(pending && phase=="preparing") {
                event("providerReady")
                val dispatch=deferredRoute;deferredRoute=null
                try{dispatch?.invoke()}catch(_:Exception){pending=false;status("error","내비 전송에 실패했어요. 연결 상태를 확인해 주세요.")}
            }
        } }
        override fun onRoutingCompleted() { ui.post { event("onRoutingCompleted"); if(pending){routeCompleted=true;readback();verify()} } }
        override fun onRouteStarted(routeStartInfo:RouteStartInfo) { ui.post { event("onRouteStarted");if(pending){routeStarted=true;readback();verify()} } }
        override fun onError(errorCode:NaviErrorCode) { ui.post { pending=false;status("error", "내비 오류가 발생했어요. 연결 상태를 확인하고 다시 전송해 주세요.") } }
        override fun onDestinationInfo(destinationInfo:DestinationInfo) { ui.post {
            event("onDestinationInfo")
            if(pending && expected.isNotEmpty()) {destinationMatches=match(expected.last(),destinationInfo.latitude,destinationInfo.longitude);verify()}
        } }
        override fun onWayPointInfo(waypointInfoList:List<WaypointInfo>) { ui.post {
            event("onWayPointInfo")
            if(pending) {
                val wanted=expected.dropLast(1)
                val methods=wanted.indices.map { i->
                    val actual=waypointInfoList.getOrNull(i);val p=wanted[i]
                    when {
                        actual==null -> "mismatch"
                        actual.latitude!=0.0 || actual.longitude!=0.0 -> if(match(p,actual.latitude,actual.longitude)) "coordinate" else "mismatch"
                        p.poiId.isNotEmpty() && p.poiId==actual.poiId -> "identity:poi-id"
                        p.name==actual.name && wanted.count {it.name==p.name}==1 -> "identity:name"
                        else -> "mismatch"
                    }
                }
                waypointsMatch=wanted.size==waypointInfoList.size && methods.none {it=="mismatch"}
                waypointVerification=if(wanted.isEmpty()) "no-waypoints" else methods.joinToString(",")
                event("waypointVerification");verify()
            }
        } }
        override fun onRouteCancelled() { ui.post { if(pending) event("onRouteCancelled") } }
        override fun onNavigationStatus(status:NavigationStatus) { ui.post { event("onNavigationStatus") } }
    }
    private fun wakeNavigation() {
        // Official Pleos Connect 2.1 emulator navigation application, discovered from the installed image.
        val intent=packageManager.getLaunchIntentForPackage("ai.umos.maps.android.navigation.app")
        if(intent!=null)startActivity(intent) else helper.requestNavigationScreen(NavigationScreenRequest.RouteOptionList)
    }
    private fun awaitProvider(generation:Int,attempt:Int=0) {
        if(!pending || generation!=requestGeneration || phase!="preparing")return
        if(attempt>=60){deferredRoute=null;pending=false;status("unavailable","내비 서비스는 연결됐지만 내비 앱 응답이 없어요. 내비 화면을 연 뒤 다시 전송해 주세요.");return}
        try{if(attempt==4)wakeNavigation();helper.getRouteStateInfo()}catch(_:Exception){}
        ui.postDelayed({awaitProvider(generation,attempt+1)},500)
    }
    override fun onCreate(savedInstanceState:Bundle?) {
        super.onCreate(savedInstanceState)
        // Remove the obsolete app-owned diagnostic file on upgrade; keep saved plans/settings.
        runCatching { java.io.File(filesDir, "navigation.log").delete() }
        web=ParkedWebView(this){inputAllowed()}
        val root=FrameLayout(this)
        root.addView(web,FrameLayout.LayoutParams(-1,-1))
        val font=Typeface.createFromAsset(assets,"AstaSans.ttf")
        lockPanel=LinearLayout(this).apply {
            orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER
            setBackgroundColor(Color.rgb(247,248,249));isClickable=true;isFocusableInTouchMode=true
            setPadding(48,48,48,48)
        }
        fun label(size:Float,color:Int)=TextView(this).apply {textSize=size;setTextColor(color);gravity=Gravity.CENTER;typeface=font}
        lockPanel.addView(label(18f,Color.rgb(80,90,100)).apply{text="가는 김에";setPadding(0,0,0,40)})
        lockTitle=label(30f,Color.rgb(25,32,38));lockPanel.addView(lockTitle)
        lockDetail=label(18f,Color.rgb(85,94,102)).apply {setPadding(0,24,0,0);setLineSpacing(8f,1f)};lockPanel.addView(lockDetail)
        root.addView(lockPanel,FrameLayout.LayoutParams(-1,-1));setContentView(root)
        applyDrivingState("unknown")
        drivingGuard=DrivingGuard(this){applyDrivingState(it)}
        web.settings.javaScriptEnabled=true; web.settings.domStorageEnabled=true
        web.settings.allowFileAccess=false; web.settings.allowContentAccess=false
        web.webViewClient=object:WebViewClient() {
            override fun shouldOverrideUrlLoading(view:WebView,request:WebResourceRequest)=true
            override fun shouldInterceptRequest(view:WebView,request:WebResourceRequest):WebResourceResponse {
                val path=request.url.path.orEmpty().removePrefix("/").ifEmpty {"index.html"}
                if(request.url.host!="app.ganegime.local" || path.contains("..") || path.contains('/')) return WebResourceResponse("text/plain","UTF-8",403,"Forbidden",emptyMap(),"Blocked".byteInputStream())
                return try { WebResourceResponse(when(path.substringAfterLast('.')) {"html"->"text/html";"css"->"text/css";"js"->"application/javascript";else->"text/plain"},"UTF-8",assets.open(path)) }
                catch(e:Exception) {WebResourceResponse("text/plain","UTF-8",404,"Not Found",emptyMap(),"Missing asset".byteInputStream())}
            }
            override fun onPageFinished(view:WebView,url:String) { publish();applyDrivingState(drivingState) }
        }
        web.addJavascriptInterface(Bridge(),"PleosNative")
        liveBridge=LiveBridge(this);web.addJavascriptInterface(liveBridge,"LiveNative")
        web.loadUrl("https://app.ganegime.local/"+if(intent.getBooleanExtra("demo",false))"index.html" else "live.html")
        helper=NaviHelper(applicationContext)
        try { helper.initialize(onConnected={ui.post { ready=true; helper.addListener(listener); status("ready","Pleos 내비 서비스 연결됨") }},onFailed={_->ui.post {ready=false;status("unavailable","내비 연결에 실패했어요. 내비 앱 실행 상태를 확인해 주세요.")}}) }
        catch(_:Exception) {status("unavailable","내비 SDK를 초기화하지 못했어요. 앱을 다시 실행해 주세요.")}
        ui.postDelayed({if(!ready && phase=="connecting")status("unavailable","내비 서비스 연결 대기시간 초과. 에뮬레이터의 내비 실행 상태를 확인해 주세요.")},20000)
        if(checkSelfPermission("android.car.permission.CAR_SPEED")!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf("android.car.permission.CAR_SPEED"),42)
    }
    override fun onResume(){super.onResume();if(::drivingGuard.isInitialized)drivingGuard.resume()}
    // Keep monitoring while the navigation app is foregrounded, including provider warm-up.
    // onResume still requires a fresh parked confirmation before accepting new input.
    override fun onPause(){super.onPause()}
    override fun onRequestPermissionsResult(requestCode:Int,permissions:Array<out String>,results:IntArray){
        super.onRequestPermissionsResult(requestCode,permissions,results)
        if(requestCode==42 && ::drivingGuard.isInitialized)drivingGuard.resume()
    }
    inner class Bridge {
        @JavascriptInterface fun openDemo() {ui.post {if(inputAllowed())web.loadUrl("https://app.ganegime.local/index.html")}}
        @JavascriptInterface fun openLive() {ui.post {if(inputAllowed())web.loadUrl("https://app.ganegime.local/live.html")}}
        @JavascriptInterface fun getStatus():String=snapshot
        @JavascriptInterface fun canEdit():Boolean=inputAllowed()
        @JavascriptInterface fun cancelPendingRoute() {ui.post {
            if(inputAllowed() && phase=="preparing"){
                requestGeneration++;deferredRoute=null;pending=false
                status("ignored","일정이 바뀌어 대기 중인 전송을 취소했어요.")
            }
        }}
        @JavascriptInterface fun sendRoute(payload:String) { ui.post { send(payload) } }
        @JavascriptInterface fun openNavigation() { ui.post { if(inputAllowed() && ready)try {wakeNavigation();ui.postDelayed({try{helper.requestNavigationScreen(NavigationScreenRequest.RouteOptionList)}catch(_:Exception){}},700)} catch(_:Exception){status("error","내비 화면을 열 수 없어요")} } }
    }
    // Only the packaged local page can call this interface. Validate again at the native boundary.
    fun send(payload:String) {
        if(!inputAllowed()){status("ignored","주차 후 내비로 전송해 주세요.");return}
        if(!ready) {status("unavailable","내비가 연결되지 않아 전송하지 않았어요");return}
        if(pending) {event("ignored");return}
        try {
            require(payload.length<12000) {"요청 크기가 너무 큽니다"}
            val list=JSONObject(payload).getJSONArray("points")
            require(list.length() in 1..3) {"한 번에 목적지 1개 + 경유지 최대 2개만 지원합니다"}
            val pts=(0 until list.length()).map { i->val o=list.getJSONObject(i)
                val name=o.getString("name"); val lat=o.getDouble("lat"); val lon=o.getDouble("lon")
                require(name.isNotBlank() && name.length<=100 && lat.isFinite() && lon.isFinite() && lat in -90.0..90.0 && lon in -180.0..180.0) {"장소 이름 또는 좌표가 올바르지 않습니다"}
                Point(name,lat,lon,o.optString("poiId"),o.optString("address"))
            }
            require(pts.zipWithNext().all{abs(it.first.lat-it.second.lat)>0.000001 || abs(it.first.lon-it.second.lon)>0.000001}) {"같은 위치를 연속으로 전송할 수 없습니다"}
            val check=JSONObject(payload).optJSONObject("departureCheck")
            require(check!=null || web.url?.endsWith("/live.html")!=true)
            val wallNow=System.currentTimeMillis()
            val departBefore=check?.let {
                val checkedAt=it.getLong("checkedAt");val validFor=it.getLong("validForMs")
                require(validFor in 0..300000 && checkedAt<=wallNow+2000)
                checkedAt+validFor
            }?:Long.MAX_VALUE
            val remaining=if(check==null)Long.MAX_VALUE else minOf(check.getLong("validForMs"),departBefore-wallNow)
            if(remaining<=0){status("expired","출발 가능한 시간이 지났어요. 남은 일정을 다시 계산해 주세요.");return}
            val elapsedBefore=if(check==null)Long.MAX_VALUE else android.os.SystemClock.elapsedRealtime()+remaining
            expected=pts; destinationMatches=false; waypointsMatch=pts.size==1; routeCompleted=false;routeStarted=false;waypointVerification=if(pts.size==1)"no-waypoints" else "none"
            pending=true; requestGeneration++; val generation=requestGeneration
            val d=pts.last(); val destination=RouteInfo(latitude=d.lat,longitude=d.lon,poiName=d.name,poiId=d.poiId,address=d.address,poiSubId="0")
            deferredRoute={
                // Check again after provider warm-up; never dispatch an expired plan or while driving.
                if(!inputAllowed() || System.currentTimeMillis()>departBefore || android.os.SystemClock.elapsedRealtime()>elapsedBefore) {
                    pending=false;status("expired","대기 중 출발 조건이 바뀌었어요. 주차 후 일정을 다시 확인해 주세요.")
                } else {
                destinationMatches=false;waypointsMatch=pts.size==1;routeCompleted=false;routeStarted=false
                status("requested","내비로 보냈습니다. 경로를 확인하는 중…")
                if(pts.size==1)helper.requestRoute(destination)
                else helper.requestRouteWithWaypoints(RouteWithWaypointsRequest(destination,pts.dropLast(1).mapIndexed {i,p->RequestWaypointInfo(latitude=p.lat,longitude=p.lon,poiName=p.name,waypointIndex=if(i==0)WaypointIndex.FIRST else WaypointIndex.SECOND,poiId=p.poiId,address=p.address,poiSubId="0")}))
                ui.postDelayed({if(pending && generation==requestGeneration)readback()},5000)
                ui.postDelayed({if(pending && generation==requestGeneration){pending=false;status("timeout","전송했지만 45초 안에 목적지와 경유 순서를 확인하지 못했어요. 내비 화면과 진단 기록을 확인해 주세요.")}},45000)
                }
            }
            status("preparing","내비 연결을 확인하는 중…")
            awaitProvider(generation)
        } catch(_:Exception) {pending=false;status("error","내비 요청을 처리하지 못했어요. 장소와 연결 상태를 확인해 주세요.")}
    }
    override fun onDestroy() {if(::drivingGuard.isInitialized)drivingGuard.close();ui.removeCallbacksAndMessages(null);if(::liveBridge.isInitialized)liveBridge.close();if(::helper.isInitialized){try{helper.removeListener(listener);helper.release()}catch(_:Exception){}};web.removeJavascriptInterface("PleosNative");web.removeJavascriptInterface("LiveNative");web.destroy();super.onDestroy()}
}
