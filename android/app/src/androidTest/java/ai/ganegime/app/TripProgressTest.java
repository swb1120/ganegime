package ai.ganegime.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import android.os.ParcelFileDescriptor;
import android.graphics.Bitmap;
import java.io.*;
import static org.junit.Assert.*;

/** Production release UI + real cloud search/planner + real Pleos navigation. */
@RunWith(AndroidJUnit4.class)
public class TripProgressTest {
 @Rule public ActivityTestRule<MainActivity> rule=new ActivityTestRule<>(MainActivity.class);
 private MainActivity a;
 private JSONArray recordingEvents=new JSONArray();
 private boolean recording(){return "true".equals(InstrumentationRegistry.getArguments().getString("recording"));}
 void main(Runnable r){InstrumentationRegistry.getInstrumentation().runOnMainSync(r);}
 String js(String code)throws Exception{
  CountDownLatch done=new CountDownLatch(1);AtomicReference<String> v=new AtomicReference<>();
  main(()->a.getWeb().evaluateJavascript(code,s->{v.set(s);done.countDown();}));
  assertTrue(done.await(10,TimeUnit.SECONDS));return v.get();
 }
 void until(String expression,int seconds)throws Exception{
  long end=System.currentTimeMillis()+seconds*1000L;
  while(System.currentTimeMillis()<end){if("true".equals(js(expression)))return;Thread.sleep(200);}
  fail("Timed out: "+expression+"; "+js("document.getElementById('compute-message')?.textContent")+"; native="+js("JSON.parse(PleosNative.getStatus())"));
 }
 void parked()throws Exception {long end=System.currentTimeMillis()+15000;while(System.currentTimeMillis()<end&&!a.inputAllowed())Thread.sleep(100);assertTrue(a.inputAllowed());}
 void search(String slot,String query)throws Exception{
  js("document.querySelector('[data-search-slot=\""+slot+"\"]').click();document.getElementById('search-query').value="+JSONObject.quote(query)+";document.getElementById('search-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  until("document.querySelectorAll('[data-select-place]').length>0",40);if(recording()&&query.equals("양재역 약국"))capture("search-results");js("document.querySelector('[data-select-place]').click()");
 }
 String add(String title,String query)throws Exception{
  js("document.getElementById('add-task').click();var row=document.querySelector('[data-task]:last-child');var title=row.querySelector('[data-field=title]');title.value="+JSONObject.quote(title)+";title.dispatchEvent(new Event('input',{bubbles:true}))");
  String id=(String)new JSONTokener(js("document.querySelector('[data-task]:last-child').dataset.task")).nextValue();search(id,query);return id;
 }
 void capture(String name)throws Exception {
  Thread.sleep(1600);
  Bitmap bitmap=null;boolean visible=false;
  for(int attempt=0;attempt<15;attempt++) {
   bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
   for(int y=100;y<bitmap.getHeight();y+=100)for(int x=100;x<bitmap.getWidth();x+=100)
    if((bitmap.getPixel(x,y)&0xffffff)>0x202020)visible=true;
   if(visible)break;
   bitmap.recycle();Thread.sleep(500);
  }
  assertTrue("Screenshot must contain a rendered screen: "+name,visible);
  recordingEvents.put(new JSONObject().put("name",name).put("time",System.currentTimeMillis()));
  ParcelFileDescriptor[] pipe=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommandRw("dd of=/data/local/tmp/ganegime-trip-"+name+".png");
  try(OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,out));}
  try(InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(pipe[0])){while(in.read()!=-1){}}
  bitmap.recycle();
  if(recording())Thread.sleep(4500);
 }
 JSONObject saved()throws Exception{return new JSONObject((String)new JSONTokener(js("localStorage.getItem('ganegime-live-v1')")).nextValue());}
 @Test public void realCompletionDeferredRestoreMarginsAndNavigation()throws Exception{
  a=rule.getActivity();parked();until("!!document.getElementById('calculate')",20);
  String original=js("localStorage.getItem('ganegime-live-v1')");
  try {
   until("document.getElementById('connection').textContent.includes('클라우드 연결됨')",30);
   js("for(let i=0;i<5&&document.querySelector('[data-remove]');i++)document.querySelector('[data-remove]').click()");
   search("origin","소프트웨어드림센터");search("destination","양재역 공영주차장");
   String first=add("약 찾기","양재역 약국"),optional=add("택배 보내기","양재역 편의점"),last=add("세탁물 찾기","양재역 세탁소");
   int oldDone=saved().getJSONArray("completed").length(),oldDeferred=saved().optJSONArray("deferred")==null?0:saved().getJSONArray("deferred").length();
   js("var at=m=>new Date(Date.now()+9*3600000+m*60000).toISOString().slice(0,16);var deadline=document.getElementById('live-deadline');deadline.value=at(240);deadline.dispatchEvent(new Event('input',{bubbles:true}));var rows=[...document.querySelectorAll('[data-task]')];rows.forEach((r,i)=>{let c=r.querySelector('[data-field=close]');c.value=at(i===1?-1:120+i*30);c.dispatchEvent(new Event('input',{bubbles:true}));});var required=rows[1].querySelector('[data-field=required]');required.checked=false;required.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('calculate').click()");
   until("!!document.querySelector('[data-alternative]')",150);
   assertTrue(js("document.getElementById('live-result').textContent").contains("마감"));
   js("document.querySelector('.result-card').scrollIntoView({block:'start'})");capture("before-alternative");
   js("document.querySelector('[data-alternative]').click()");
   assertEquals(2,saved().getJSONArray("tasks").length());assertEquals(oldDeferred+1,saved().getJSONArray("deferred").length());
   JSONObject deferred=null;JSONArray archive=saved().getJSONArray("deferred");for(int i=0;i<archive.length();i++)if(optional.equals(archive.getJSONObject(i).getString("id")))deferred=archive.getJSONObject(i);
   assertNotNull(deferred);assertTrue(deferred.has("place"));String oldClose=deferred.getString("close");
   js("document.getElementById('deferred-section').scrollIntoView({block:'center'})");capture("deferred");
   JSONObject firstPlace=null;JSONArray active=saved().getJSONArray("tasks");for(int i=0;i<active.length();i++)if(first.equals(active.getJSONObject(i).getString("id")))firstPlace=active.getJSONObject(i).getJSONObject("place");
   assertNotNull(firstPlace);
   js("document.querySelector('[data-complete=\""+first+"\"]').click()");capture("completion-confirmation");
   js("document.getElementById('complete-confirm').click()");
   until("document.getElementById('compute-message').textContent.includes('남은 일정 계산 완료')",150);
   assertEquals(1,saved().getJSONArray("tasks").length());assertEquals(last,saved().getJSONArray("tasks").getJSONObject(0).getString("id"));
   assertEquals(firstPlace.getDouble("lat"),saved().getJSONObject("origin").getDouble("lat"),0.000001);
   assertEquals(oldDone+1,saved().getJSONArray("completed").length());assertEquals(oldDeferred+1,saved().getJSONArray("deferred").length());
   assertEquals("2",js("document.querySelectorAll('#live-result .route-stop').length"));
   assertTrue(js("document.querySelector('[data-stop-margin]').textContent").contains("여유"));
   js("document.querySelector('.result-card').scrollIntoView({block:'start'})");capture("remaining-plan");
   // Exercise the real Kotlin dispatch boundary using an already-expired departure budget.
   JSONObject expired=new JSONObject().put("points",new JSONArray().put(new JSONObject().put("name",firstPlace.getString("name")).put("lat",firstPlace.getDouble("lat")).put("lon",firstPlace.getDouble("lon"))))
    .put("departureCheck",new JSONObject().put("checkedAt",System.currentTimeMillis()-10000).put("validForMs",1000));
   main(()->a.send(expired.toString()));until("JSON.parse(PleosNative.getStatus()).phase==='expired'",10);
   js("document.getElementById('live-send').click()");until("JSON.parse(PleosNative.getStatus()).phase==='verified'",90);
   JSONObject nav=new JSONObject(js("JSON.parse(PleosNative.getStatus())"));assertTrue(nav.getBoolean("destinationMatches"));assertTrue(nav.getBoolean("waypointsMatch"));
   main(()->a.startActivity(new android.content.Intent(a,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));Thread.sleep(500);parked();
   js("document.querySelector('.navigation-card').scrollIntoView({block:'center'})");capture("remaining-navigation");
   if(recording()){
    js("document.getElementById('live-open').click()");Thread.sleep(3500);capture("native-navigation");
    main(()->a.startActivity(new android.content.Intent(a,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));Thread.sleep(500);parked();
   }
   js("document.querySelector('[data-restore=\""+optional+"\"]').click()");assertEquals(2,saved().getJSONArray("tasks").length());assertEquals(oldDeferred,saved().getJSONArray("deferred").length());
   assertEquals("true",js("document.getElementById('live-send').disabled"));
   js("window.__tripOld=true");main(()->a.getWeb().loadUrl("https://app.ganegime.local/live.html"));
   until("!window.__tripOld && !!document.getElementById('calculate')",20);
   assertEquals(2,saved().getJSONArray("tasks").length());assertEquals(oldDone+1,saved().getJSONArray("completed").length());
   boolean found=false;for(int i=0;i<saved().getJSONArray("tasks").length();i++){JSONObject task=saved().getJSONArray("tasks").getJSONObject(i);if(optional.equals(task.getString("id"))){found=true;assertEquals(oldClose,task.getString("close"));}}
   assertTrue(found);capture("restored-after-reload");
   if(recording()){
    ParcelFileDescriptor[] pipe=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommandRw("dd of=/data/local/tmp/ganegime-trip-events.json");
    try(OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){out.write(recordingEvents.toString(2).getBytes("UTF-8"));}
    try(InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(pipe[0])){while(in.read()!=-1){}}
   }
  } finally {
   main(()->a.startActivity(new android.content.Intent(a,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));Thread.sleep(500);
   js(original==null||original.equals("null")?"localStorage.removeItem('ganegime-live-v1')":"localStorage.setItem('ganegime-live-v1',"+original+")");
  }
 }
}
