package ai.ganegime.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.rule.ActivityTestRule;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Real emulator integration test. No NaviHelper calls or callbacks are mocked. */
@RunWith(AndroidJUnit4.class)
public class NavigationIntegrationTest {
    @Rule public ActivityTestRule<MainActivity> rule=new ActivityTestRule<MainActivity>(MainActivity.class){@Override protected android.content.Intent getActivityIntent(){return new android.content.Intent().putExtra("demo",true);}};
    private android.app.Instrumentation getInstrumentation(){return InstrumentationRegistry.getInstrumentation();}
    private MainActivity activity;
    private String js(String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1); AtomicReference<String> result=new AtomicReference<>();
        getInstrumentation().runOnMainSync(()->activity.getWeb().evaluateJavascript(script,value->{result.set(value);done.countDown();}));
        assertTrue("WebView JavaScript callback timed out",done.await(10,TimeUnit.SECONDS));return result.get();
    }
    private JSONObject status() throws Exception {return new JSONObject(js("JSON.parse(PleosNative.getStatus())"));}
    private void capture(String name) throws Exception {
        try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(activity.getFilesDir(),name+".png"))){getInstrumentation().getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}
    }
    private JSONObject awaitRoute() throws Exception {
        long end=System.currentTimeMillis()+50000;JSONObject s=status();
        while(System.currentTimeMillis()<end && !"verified".equals(s.optString("phase")) && !"error".equals(s.optString("phase")) && !"timeout".equals(s.optString("phase"))){Thread.sleep(500);s=status();}
        return s;
    }
    @Test public void testRecommendedRouteReachesRealPleosNavigation() throws Exception {
        activity=rule.getActivity();
        long deadline=System.currentTimeMillis()+30000;
        while(System.currentTimeMillis()<deadline){if("true".equals(js("!!document.getElementById('pleos-launch')")))break;Thread.sleep(300);}
        assertEquals("Packaged planner and navigation UI loaded","true",js("!!document.getElementById('pleos-launch')"));
        while(System.currentTimeMillis()<deadline && !status().optBoolean("ready"))Thread.sleep(300);
        assertTrue("Real Pleos service connected: "+status(),status().optBoolean("ready"));
        capture("planner-screen");
        js("PleosNative.sendRoute(JSON.stringify({points:[]}))");Thread.sleep(200);
        assertEquals("Invalid payload rejected at native boundary","error",status().optString("phase"));
        js("document.getElementById('pleos-launch').click()");
        assertEquals("Send enabled for feasible recommendation","false",js("document.getElementById('pleos-send').disabled"));
        js("document.getElementById('pleos-send').click()");
        js("PleosNative.sendRoute(JSON.stringify({points:[]}))");Thread.sleep(200);
        assertTrue("Duplicate native request ignored while routing",status().getBoolean("pending"));
        JSONObject s=awaitRoute();
        android.util.Log.i("GanegimeTest",s.toString());
        java.io.File evidence=new java.io.File(activity.getFilesDir(),"integration-result.json");
        try(java.io.FileWriter writer=new java.io.FileWriter(evidence)){writer.write(s.toString(2));}
        capture("integration-screen");
        assertEquals("Actual route accepted; destination coordinates and waypoint identities/order match: "+s,"verified",s.optString("phase"));
        assertTrue(s.getBoolean("destinationMatches"));assertTrue(s.getBoolean("waypointsMatch"));
        js("document.getElementById('pleos-open').click()");Thread.sleep(2000);capture("native-navigation-screen");
        getInstrumentation().runOnMainSync(()->activity.startActivity(new android.content.Intent(activity,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));
        Thread.sleep(1000);
        js("document.getElementById('pleos-next').click(); document.getElementById('pleos-send').click()");
        s=awaitRoute();
        try(java.io.FileWriter writer=new java.io.FileWriter(new java.io.File(activity.getFilesDir(),"final-destination-result.json"))){writer.write(s.toString(2));}
        capture("final-destination-screen");
        assertEquals("Final destination without waypoints verified: "+s,"verified",s.optString("phase"));
        assertEquals("No next-segment button after final destination","\"none\"",js("getComputedStyle(document.getElementById('pleos-next')).display"));
    }
}
