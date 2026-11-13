package ai.ganegime.app;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.rule.ActivityTestRule;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.*;import org.junit.runner.RunWith;import org.json.*;
import static org.junit.Assert.*;import java.util.concurrent.*;import java.util.concurrent.atomic.AtomicReference;

/** Records actual production UI actions. Demo data is isolated from live API calls. */
@RunWith(AndroidJUnit4.class)
public class SubmissionVideoTest {
 @Rule public ActivityTestRule<MainActivity> rule=new ActivityTestRule<MainActivity>(MainActivity.class){@Override protected android.content.Intent getActivityIntent(){return new android.content.Intent().putExtra("demo",true);}};
 private MainActivity a;private JSONArray events=new JSONArray();
 @Before public void optionalLocalCredentials()throws Exception{
  // This fixture is local-only, absent from published source and all release assets.
  try(java.io.InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("local-cloud.json")){
   java.io.File target=new java.io.File(rule.getActivity().getFilesDir(),"cloud-backend.json");
   if(!target.exists() || "true".equals(InstrumentationRegistry.getArguments().getString("reviewerMode")))try(java.io.OutputStream out=new java.io.FileOutputStream(target)){byte[] b=new byte[4096];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}
  }catch(java.io.FileNotFoundException ignored){}
 }
 private android.app.Instrumentation ins(){return InstrumentationRegistry.getInstrumentation();}
 private String js(String code)throws Exception{CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> v=new AtomicReference<>();ins().runOnMainSync(()->a.getWeb().evaluateJavascript(code,x->{v.set(x);latch.countDown();}));assertTrue(latch.await(10,TimeUnit.SECONDS));return v.get();}
 private void until(String code,int seconds)throws Exception{long end=System.currentTimeMillis()+seconds*1000L;while(System.currentTimeMillis()<end){if("true".equals(js(code)))return;Thread.sleep(250);}fail("Timed out "+code+" "+js("document.body.innerText"));}
 private void pause(long ms)throws Exception{Thread.sleep(ms);}
 private java.io.File recordingFile(String name){return new java.io.File(a.getExternalFilesDir(null),"submission-"+name);}
 private void mark(String name)throws Exception{ins().waitForIdleSync();pause(700);events.put(new JSONObject().put("name",name).put("time",System.currentTimeMillis()));try(java.io.FileOutputStream f=new java.io.FileOutputStream(recordingFile(name+".png"))){ins().getUiAutomation().takeScreenshot().compress(android.graphics.Bitmap.CompressFormat.PNG,100,f);}}
 private void save(String type)throws Exception{try(java.io.FileWriter f=new java.io.FileWriter(recordingFile(type+"-events.json"))){f.write(events.toString(2));}exportFiles();}
 private void exportFiles()throws Exception{
  // Only explicit recording artifacts are exported by instrumentation, never app settings.
  for(java.io.File f:a.getExternalFilesDir(null).listFiles()){
   if(!f.getName().matches("submission-[a-z-]+\\.(png|json)"))continue;
   android.os.ParcelFileDescriptor[] pipe=ins().getUiAutomation().executeShellCommandRw("dd of=/data/local/tmp/ganegime-"+f.getName());
   try(java.io.InputStream input=new java.io.FileInputStream(f);java.io.OutputStream output=new android.os.ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){byte[] buf=new byte[65536];int n;while((n=input.read(buf))!=-1)output.write(buf,0,n);}
   try(java.io.InputStream done=new android.os.ParcelFileDescriptor.AutoCloseInputStream(pipe[0])){while(done.read()!=-1){}}
  }
 }
 @Test public void exportExistingRecordings()throws Exception{a=rule.getActivity();exportFiles();}
 @Test public void comparisonRecording()throws Exception{
  a=rule.getActivity();waitParked();until("typeof go==='function' && !!window.Showcase",30);
  until("document.fonts.check('18px \"Asta Sans\"')",20);
  js("go('compare');document.querySelector('.method-grid').scrollIntoView({block:'start'})");mark("compare");pause(11000);
  js("go('lab');document.querySelector('.lab-workspace').scrollIntoView({block:'start'})");mark("deadline-before");pause(4000);
  js("document.querySelector('[data-action=lab-apply-preset]').click();document.querySelector('.lab-workspace').scrollIntoView({block:'start'})");until("document.querySelector('[data-outcome=after] .lab-time').textContent.includes('19:17')",10);pause(1200);mark("deadline-after");pause(6000);
  js("document.querySelector('[data-scenario=duration]').click();document.querySelector('.lab-workspace').scrollIntoView({block:'start'})");mark("duration-before");pause(3000);
  js("document.querySelector('[data-action=lab-apply-preset]').click();document.querySelector('.lab-workspace').scrollIntoView({block:'start'})");until("document.querySelector('[data-outcome=after] .lab-time').textContent.includes('19:35')",10);pause(1200);mark("duration-after");pause(7000);
  js("document.querySelector('[data-scenario=required]').click();document.querySelector('.lab-workspace').scrollIntoView({block:'start'})");mark("required-before");pause(3000);
  js("document.querySelector('[data-action=lab-apply-preset]').click();document.querySelector('.lab-workspace').scrollIntoView({block:'start'})");until("document.querySelector('[data-outcome=after]').textContent.includes('대안0개')",10);pause(1200);mark("required-after");pause(7000);
  save("comparison");
 }
 private void search(String slot,String query,boolean linger)throws Exception{
  js("document.querySelector('[data-search-slot=\""+slot+"\"]').click(); document.getElementById('search-query').value="+JSONObject.quote(query));
  if(linger){mark("search-query");pause(2000);}
  js("document.getElementById('search-form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  until("document.querySelectorAll('#search-results .search-place').length>0",30);
  if(linger){mark("search-results");pause(5000);}
  js("document.querySelector('[data-select-place=\"0\"]').click()");pause(700);
 }
 @Test public void liveRecording()throws Exception{
  a=rule.getActivity();waitParked();until("!!window.PleosNative",30);js("PleosNative.openLive()");until("!!document.getElementById('calculate')",30);
  String old=js("localStorage.getItem('ganegime-live-v1')");
  try{
   // Reset through the real editor. Page-initiated reload is blocked by the local-only WebView policy.
   js("for(let i=0;i<5&&document.querySelector('[data-remove]');i++)document.querySelector('[data-remove]').click()");
   until("document.querySelectorAll('[data-task]').length===0",10);
   until("document.getElementById('connection').textContent.includes('클라우드 연결됨')",30);
   if("true".equals(InstrumentationRegistry.getArguments().getString("reviewerMode"))){
    js("var savedResponse=window.onLiveResponse;window.onLiveResponse=r=>{if(r.ok&&r.data.access==='review')window.reviewerGatewayVerified=true;savedResponse(r)};document.getElementById('check-connection').click()");
    until("window.reviewerGatewayVerified===true",30);
   }
   until("document.fonts.check('18px \"Asta Sans\"')",20);mark("cloud-connected");pause(3000);
   search("origin","소프트웨어드림센터",false);search("destination","양재역 공영주차장",false);
   js("document.getElementById('add-task').click();var t=document.querySelector('[data-field=title]');t.value='약 찾기';t.dispatchEvent(new Event('input',{bubbles:true}))");
   String id=new JSONTokener(js("document.querySelector('[data-task]').dataset.task")).nextValue().toString();search(id,"양재역 약국",true);
   js("document.getElementById('add-task').click();var t=document.querySelectorAll('[data-field=title]')[1];t.value='택배 보내기';t.dispatchEvent(new Event('input',{bubbles:true}))");
   id=new JSONTokener(js("document.querySelectorAll('[data-task]')[1].dataset.task")).nextValue().toString();search(id,"양재역 편의점",false);
   js("var d=document.getElementById('live-deadline');d.value=new Date(Date.now()+13*3600000).toISOString().slice(0,16);d.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('live-tasks').scrollIntoView({block:'start'})");mark("live-input");pause(5000);
   js("document.getElementById('calculate').click()");mark("calculating");until("document.querySelectorAll('#live-result .route-stop').length===3",120);
   js("document.getElementById('live-result').scrollIntoView({block:'start'})");mark("live-plan");pause(9000);
   until("!document.getElementById('live-send').disabled",25);js("document.querySelector('.navigation-card').scrollIntoView({block:'center'})");mark("navigation-before");pause(2500);js("document.getElementById('live-send').click()");
   until("JSON.parse(PleosNative.getStatus()).phase==='verified'",80);
   ins().runOnMainSync(()->a.startActivity(new android.content.Intent(a,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));pause(1000);
   js("document.querySelector('.navigation-card').scrollIntoView({block:'center'})");mark("navigation-verified");pause(6000);
   JSONObject status=new JSONObject(js("JSON.parse(PleosNative.getStatus())"));assertTrue(status.getBoolean("destinationMatches"));assertTrue(status.getBoolean("waypointsMatch"));
   // Actual SDK callbacks and the dispatch path must not expose places in diagnostics.
   JSONArray diagnosticEvents=status.getJSONArray("events");
   for(int i=0;i<diagnosticEvents.length();i++)assertTrue(diagnosticEvents.getString(i).matches("[0-9]+ [A-Za-z]+"));
   JSONObject entered=new JSONObject(new JSONTokener(js("localStorage.getItem('ganegime-live-v1')")).nextValue().toString());
   java.util.ArrayList<JSONObject> places=new java.util.ArrayList<>();places.add(entered.getJSONObject("origin"));places.add(entered.getJSONObject("destination"));
   for(int i=0;i<entered.getJSONArray("tasks").length();i++)places.add(entered.getJSONArray("tasks").getJSONObject(i).getJSONObject("place"));
   for(JSONObject place:places)assertFalse("Place name leaked in diagnostics",status.toString().contains(place.getString("name")));
   assertFalse("No persistent navigation log",new java.io.File(a.getFilesDir(),"navigation.log").exists());
   try(java.io.FileWriter f=new java.io.FileWriter(recordingFile("sdk.json"))){f.write(status.toString(2));}
   js("document.getElementById('live-open').click()");pause(3500);mark("native-navigation");pause(8000);
   save("live");
  }finally{
   ins().runOnMainSync(()->a.startActivity(new android.content.Intent(a,MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));pause(600);
   js(old==null||old.equals("null")?"localStorage.removeItem('ganegime-live-v1')":"localStorage.setItem('ganegime-live-v1',"+old+")");
  }
 }
 private void waitParked()throws Exception {
  long until=System.currentTimeMillis()+20000;
  while(System.currentTimeMillis()<until && !a.inputAllowed())pause(100);
  assertTrue("Virtual Console must confirm P and zero speed",a.inputAllowed());
 }
}
