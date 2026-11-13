package ai.ganegime.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class PrivacyRegressionTest {
 @Rule public ActivityTestRule<MainActivity> rule=new ActivityTestRule<MainActivity>(MainActivity.class){
  @Override protected void beforeActivityLaunched(){
   try(FileOutputStream out=new FileOutputStream(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),"navigation.log"))){out.write("LEGACY_PRIVATE_PLACE 37.54321 127.12345".getBytes("UTF-8"));}
   catch(Exception e){throw new AssertionError("Could not prepare migration fixture",e);}
  }
 };
 private String status()throws Exception{
  AtomicReference<String> value=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
  InstrumentationRegistry.getInstrumentation().runOnMainSync(()->rule.getActivity().getWeb().evaluateJavascript("JSON.parse(PleosNative.getStatus())",s->{value.set(s);done.countDown();}));
  assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();
 }
 @Test public void obsoleteLocationLogIsRemovedOnLaunch(){
  assertFalse("Legacy diagnostic log must be removed",new File(rule.getActivity().getFilesDir(),"navigation.log").exists());
 }
 @Test public void malformedPrivatePayloadDoesNotReachDiagnostics()throws Exception{
  long end=System.currentTimeMillis()+30000;boolean ready=false;
  while(System.currentTimeMillis()<end){try{ready=new JSONObject(status()).optBoolean("ready") && rule.getActivity().inputAllowed();}catch(Exception ignored){}if(ready)break;Thread.sleep(200);}
  assertTrue("Native service must be ready to exercise payload validation",ready);
  InstrumentationRegistry.getInstrumentation().runOnMainSync(()->rule.getActivity().send("{\"points\":\"PRIVATE_PAYLOAD_MARKER 37.54321 127.12345\"}"));
  JSONObject snapshot=new JSONObject(status());assertEquals("error",snapshot.getString("phase"));
  assertFalse(snapshot.toString().contains("PRIVATE_PAYLOAD_MARKER"));assertFalse(snapshot.toString().contains("37.54321"));
  JSONArray events=snapshot.getJSONArray("events");assertTrue(events.length()>0);
  for(int i=0;i<events.length();i++)assertTrue(events.getString(i).matches("[0-9]+ [A-Za-z]+"));
  assertFalse(new File(rule.getActivity().getFilesDir(),"navigation.log").exists());
 }
}
