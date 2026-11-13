package ai.ganegime.app;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.rule.ActivityTestRule;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import static org.junit.Assert.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;

/** Live Kakao search + traffic + real Pleos navigation. No fixture provider is used. */
@RunWith(AndroidJUnit4.class)
public class LiveIntegrationTest {
 @Rule public ActivityTestRule<MainActivity> rule=new ActivityTestRule<>(MainActivity.class);
 private MainActivity activity;
 private android.app.Instrumentation ins(){return InstrumentationRegistry.getInstrumentation();}
 private String js(String script)throws Exception{CountDownLatch done=new CountDownLatch(1);AtomicReference<String> out=new AtomicReference<>();ins().runOnMainSync(()->activity.getWeb().evaluateJavascript(script,v->{out.set(v);done.countDown();}));assertTrue(done.await(10,TimeUnit.SECONDS));return out.get();}
 private void until(String expr,int seconds)throws Exception{long end=System.currentTimeMillis()+seconds*1000L;while(System.currentTimeMillis()<end){if("true".equals(js(expr)))return;Thread.sleep(250);}fail("Timed out: "+expr+" UI: "+js("document.body.innerText"));}
 private void capture(String name)throws Exception{ins().waitForIdleSync();Thread.sleep(600);try(java.io.FileOutputStream out=new java.io.FileOutputStream(new java.io.File(activity.getFilesDir(),name+".png"))){ins().getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,out);}}
 private void searchPlace(String slot,String query)throws Exception{
  js("document.querySelector('[data-search-slot=\""+slot+"\"]').click(); document.getElementById('search-query').value="+JSONObject.quote(query)+"; document.getElementById('search-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  until("document.querySelectorAll('#search-results .search-place').length>0",20);
  capture("live-search");js("document.querySelector('[data-select-place=\"0\"]').click()");
 }
 @Test public void realSearchTrafficAndNavigation()throws Exception{
  activity=rule.getActivity();until("!!document.getElementById('calculate')",30);
  String previous=js("localStorage.getItem('ganegime-live-v1')");
  try{
   js("localStorage.removeItem('ganegime-live-v1'); location.reload()");until("!!document.getElementById('calculate')",20);
   until("document.getElementById('connection').textContent.includes('클라우드 연결됨')",30);
   searchPlace("origin","소프트웨어드림센터");searchPlace("destination","양재역 공영주차장");
   js("document.getElementById('add-task').click(); var title=document.querySelector('[data-field=title]');title.value='약 찾기';title.dispatchEvent(new Event('input',{bubbles:true}))");
   String id=new org.json.JSONTokener(js("document.querySelector('[data-task]').dataset.task")).nextValue().toString();searchPlace(id,"양재역 약국");
   js("document.getElementById('add-task').click(); var title=document.querySelectorAll('[data-field=title]')[1];title.value='택배 보내기';title.dispatchEvent(new Event('input',{bubbles:true}))");
   id=new org.json.JSONTokener(js("document.querySelectorAll('[data-task]')[1].dataset.task")).nextValue().toString();searchPlace(id,"양재역 편의점");
   js("var deadline=document.getElementById('live-deadline');deadline.value=new Date(Date.now()+13*3600000).toISOString().slice(0,16);deadline.dispatchEvent(new Event('input',{bubbles:true}))");
   capture("live-input");js("document.getElementById('calculate').click()");
   until("document.querySelectorAll('#live-result .route-stop').length===3",120);
   until("!document.getElementById('live-send').disabled",20);capture("live-plan");
   String rendered=js("document.getElementById('live-result').innerText");
   try(java.io.FileWriter out=new java.io.FileWriter(new java.io.File(activity.getFilesDir(),"live-plan-text.json"))){out.write(rendered);}
   js("document.getElementById('live-send').click()");
   until("JSON.parse(PleosNative.getStatus()).phase==='verified'",80);
   ins().runOnMainSync(()->activity.startActivity(new android.content.Intent(activity,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));
   Thread.sleep(500);js("document.querySelector('.navigation-card').scrollIntoView({block:'center'})");Thread.sleep(1000);capture("live-navigation-confirmed");
   JSONObject status=new JSONObject(js("JSON.parse(PleosNative.getStatus())"));
   assertTrue(status.getBoolean("destinationMatches"));assertTrue(status.getBoolean("waypointsMatch"));
   try(java.io.FileWriter out=new java.io.FileWriter(new java.io.File(activity.getFilesDir(),"live-sdk-result.json"))){out.write(status.toString(2));}
   js("document.getElementById('live-open').click()");Thread.sleep(3000);capture("live-native-navigation");
  }finally{
   ins().runOnMainSync(()->activity.startActivity(new android.content.Intent(activity,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));
   Thread.sleep(500);
   js(previous==null||previous.equals("null")?"localStorage.removeItem('ganegime-live-v1')":"localStorage.setItem('ganegime-live-v1',"+previous+")");
  }
 }
}
