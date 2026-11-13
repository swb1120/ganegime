package ai.ganegime.app

/** Monotonic clock only. No saved bypass, location data, or assumptions about unknown gear. */
class ParkingPolicy {
    companion object { const val FRESH_MS = 2500L; const val SETTLE_MS = 1000L; const val PARK = 4 }
    private var speed: Float? = null
    private var gear: Int? = null
    private var speedAt = -1L
    private var gearAt = -1L
    private var stoppedSince = -1L
    fun reset() { speed=null; gear=null; speedAt=-1; gearAt=-1; stoppedSince=-1 }
    fun speed(value: Float?, now: Long) { speed=value?.takeIf { it.isFinite() }; speedAt=now; update(now) }
    fun gear(value: Int?, now: Long) { gear=value; gearAt=now; update(now) }
    private fun known(now: Long) = speed!=null && gear!=null && gear!=0 && now-speedAt in 0..FRESH_MS && now-gearAt in 0..FRESH_MS
    private fun update(now: Long) {
        if (!known(now) || speed!=0f || gear!=PARK) stoppedSince=-1
        else if(stoppedSince<0) stoppedSince=now
    }
    fun state(now: Long): String {
        update(now)
        return when {
            !known(now) -> "unknown"
            speed!=0f -> "moving"
            gear!=PARK -> "not_parked"
            stoppedSince<0 || now-stoppedSince<SETTLE_MS -> "confirming"
            else -> "parked"
        }
    }
}
