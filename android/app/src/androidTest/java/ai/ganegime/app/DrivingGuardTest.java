package ai.ganegime.app;

import android.view.View;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputConnection;
import android.os.SystemClock;
import android.os.ParcelFileDescriptor;
import android.graphics.Bitmap;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;
import org.junit.*;
import org.junit.runner.RunWith;
import java.net.Socket;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DrivingGuardTest {
 @Rule public ActivityTestRule<MainActivity> rule=new ActivityTestRule<>(MainActivity.class);
 void main(Runnable action){InstrumentationRegistry.getInstrumentation().runOnMainSync(action);}
 String js(String code)throws Exception {
  AtomicReference<String> value=new AtomicReference<>();CountDownLatch done=new CountDownLatch(1);
  main(()->rule.getActivity().getWeb().evaluateJavascript(code,s->{value.set(s);done.countDown();}));
  assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();
 }
 // This is the official emulator console, not an app-side mock or a release bypass.
 String console(String method,String path)throws Exception {
  try(Socket s=new Socket("127.0.0.1",8088)) {
   s.setSoTimeout(5000);
   s.getOutputStream().write((method+" "+path+" HTTP/1.1\r\nHost: 127.0.0.1:8088\r\nConnection: close\r\nContent-Length: 0\r\n\r\n").getBytes("UTF-8"));
   ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] b=new byte[4096];int n;
   while((n=s.getInputStream().read(b))!=-1)out.write(b,0,n);
   String result=out.toString("UTF-8");assertTrue(result.substring(0,Math.min(80,result.length())),result.startsWith("HTTP/1.1 200"));
   return result.substring(result.indexOf("\r\n\r\n")+4);
  }
 }
 void vehicle(String gear,int speed)throws Exception {
  console("PUT","/vehicle/controls?speed=0&accelerator=0&brake=0&steering=0");
  console("PUT","/vehicle/gear?gear="+gear);
  console("PUT","/vehicle/controls?speed="+speed+"&accelerator=0&brake=0&steering=0");
 }
 void state(String expected)throws Exception {
  long end=SystemClock.elapsedRealtime()+12000;
  AtomicReference<String> observed=new AtomicReference<>();
  while(SystemClock.elapsedRealtime()<end) {
   main(()->observed.set(rule.getActivity().getDrivingState()+":"+rule.getActivity().inputAllowed()));
   if((expected+":"+expected.equals("parked")).equals(observed.get()))return;
   Thread.sleep(100);
  }
  assertEquals("Vehicle state and current input authorization",expected+":"+expected.equals("parked"),observed.get());
 }
 void shot(String name)throws Exception {
  // Allow the Pleos system restriction surface to finish its own transition.
  Thread.sleep(1600);
  Bitmap b=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
  ParcelFileDescriptor[] pipe=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommandRw("dd of=/data/local/tmp/ganegime-guard-"+name+".png");
  try(OutputStream out=new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])){assertTrue(b.compress(Bitmap.CompressFormat.PNG,100,out));}
  try(InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(pipe[0])){while(in.read()!=-1){}}
  b.recycle();
 }
 @Test public void realVehicleSignalsBlockTouchKeyboardAndBridgesAndPreserveDraft()throws Exception {
  ScheduledExecutorService heartbeat=Executors.newSingleThreadScheduledExecutor();
  java.util.concurrent.atomic.AtomicBoolean heartbeatOn=new java.util.concurrent.atomic.AtomicBoolean(true);
  heartbeat.scheduleAtFixedRate(()->{if(heartbeatOn.get())try{console("POST","/browser/session?client=ganegime-guard-test");}catch(Exception ignored){}},0,1,TimeUnit.SECONDS);
  Thread.sleep(2000);
  String original=console("GET","/vehicle/state");
  try {
   vehicle("Park",0);state("parked");
   long end=SystemClock.elapsedRealtime()+10000;
   while(SystemClock.elapsedRealtime()<end && !"true".equals(js("!!document.getElementById('search-query')")))Thread.sleep(100);
   js("document.getElementById('search-dialog').showModal();document.getElementById('search-query').value='주차 전 검색어';document.getElementById('search-query').focus()");
   main(()->rule.getActivity().getWeb().requestFocus());
   JSONObject point=new JSONObject(js("(()=>{let r=document.getElementById('search-query').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth}})()"));
   int[] origin=new int[2];main(()->rule.getActivity().getWeb().getLocationOnScreen(origin));
   float scale=rule.getActivity().getWeb().getWidth()/(float)point.getDouble("w");
   float x=origin[0]+(float)point.getDouble("x")*scale,y=origin[1]+(float)point.getDouble("y")*scale;
   long touchAt=SystemClock.uptimeMillis();
   MotionEvent down=MotionEvent.obtain(touchAt,touchAt,MotionEvent.ACTION_DOWN,x,y,0),up=MotionEvent.obtain(touchAt,touchAt+80,MotionEvent.ACTION_UP,x,y,0);
   InstrumentationRegistry.getInstrumentation().sendPointerSync(down);InstrumentationRegistry.getInstrumentation().sendPointerSync(up);down.recycle();up.recycle();
   Thread.sleep(800);
   AtomicReference<InputConnection> keyboard=new AtomicReference<>();
   main(()->keyboard.set(rule.getActivity().getWeb().onCreateInputConnection(new EditorInfo())));
   shot("parked");
   assertNotNull("Search keyboard connection",keyboard.get());
   vehicle("Drive",30);state("moving");shot("moving");
   assertEquals("true",js("document.documentElement.inert"));
   main(()->{
    assertEquals(View.INVISIBLE,rule.getActivity().getWeb().getVisibility());
    assertFalse(keyboard.get().commitText("BLOCKED",1));
    assertFalse(keyboard.get().commitText("BLOCKED",1,null));
    assertFalse(keyboard.get().setComposingText("BLOCKED",1,null));
    assertFalse(keyboard.get().replaceText(0,1,"BLOCKED",1,null));
    assertFalse(keyboard.get().deleteSurroundingText(100,100));
    assertTrue(rule.getActivity().getWeb().dispatchKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_A)));
    long now=SystemClock.uptimeMillis();MotionEvent touch=MotionEvent.obtain(now,now,MotionEvent.ACTION_DOWN,100,100,0);
    assertTrue(rule.getActivity().getWeb().dispatchTouchEvent(touch));touch.recycle();
    rule.getActivity().send("{}");
   });
   assertEquals("\"주차 전 검색어\"",js("document.getElementById('search-query').value"));
   assertEquals("\"ignored\"",js("JSON.parse(PleosNative.getStatus()).phase"));
   js("window.__oldResponse=window.onLiveResponse;window.onLiveResponse=r=>{if(r.id==='guardTest')window.__guardReply=r;else window.__oldResponse(r)};LiveNative.request('guardTest','search','{}')");
   long replyUntil=SystemClock.elapsedRealtime()+5000;
   while(SystemClock.elapsedRealtime()<replyUntil && !"true".equals(js("!!window.__guardReply")))Thread.sleep(100);
   assertEquals("\"PARK_REQUIRED\"",js("window.__guardReply.data.error"));
   js("window.onLiveResponse=window.__oldResponse;PleosNative.openDemo();LiveNative.configure()");
   assertEquals("true",js("!!document.getElementById('search-query')"));
   vehicle("Drive",0);state("not_parked");shot("stopped-drive");
   vehicle("Reverse",10);state("moving");
   vehicle("Neutral",0);state("not_parked");
   vehicle("Park",0);state("parked");
   // Reverse legitimately opens Pleos' camera app. Simulate the user returning to this app in P.
   main(()->rule.getActivity().startActivity(new android.content.Intent(rule.getActivity(),MainActivity.class).addFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT)));
   Thread.sleep(300);state("parked");
   long restoreUntil=SystemClock.elapsedRealtime()+12000;
   while(SystemClock.elapsedRealtime()<restoreUntil && !"false".equals(js("document.documentElement.inert")))Thread.sleep(100);
   shot("restored");
   assertEquals("false",js("document.documentElement.inert"));
   assertEquals("\"주차 전 검색어\"",js("document.getElementById('search-query').value"));
   js("document.getElementById('search-dialog').close()");
   js("LiveNative.configure()");Thread.sleep(300);
   java.lang.reflect.Field liveField=MainActivity.class.getDeclaredField("liveBridge");liveField.setAccessible(true);
   Object bridge=liveField.get(rule.getActivity());java.lang.reflect.Field dialogField=LiveBridge.class.getDeclaredField("configuration");dialogField.setAccessible(true);
   android.app.AlertDialog dialog=(android.app.AlertDialog)dialogField.get(bridge);assertNotNull(dialog);assertTrue(dialog.isShowing());
   vehicle("Drive",0);state("not_parked");assertFalse("Native configuration must close on shift",dialog.isShowing());
   vehicle("Park",0);state("parked");js("PleosNative.openDemo()");Thread.sleep(700);
   assertEquals("true",js("typeof go==='function'"));
   vehicle("Drive",0);state("not_parked");assertEquals("true",js("document.documentElement.inert"));
   vehicle("Park",0);state("parked");
  } finally {
   try {
    heartbeatOn.set(true);console("POST","/browser/session?client=ganegime-guard-test");Thread.sleep(500);
    JSONObject originalState=new JSONObject(original);JSONObject gear=originalState.getJSONObject("gear").optJSONObject("actual");
    vehicle(gear==null?"Park":gear.getString("value"),originalState.getJSONObject("controls").getInt("speed_kph"));
   } finally {heartbeat.shutdownNow();console("POST","/browser/session?client=ganegime-guard-test&closing=1");}
  }
 }
 @Test public void unknownStaleReverseAndBriefStopsRemainLocked(){
  ParkingPolicy p=new ParkingPolicy();assertEquals("unknown",p.state(0));
  p.speed(0f,0);p.gear(4,0);assertEquals("confirming",p.state(999));assertEquals("parked",p.state(1000));
  assertEquals("unknown",p.state(2501));
  p.speed(0f,3000);p.gear(4,3000);assertEquals("confirming",p.state(3000));
  p.speed(-1f,3100);assertEquals("moving",p.state(3100));
  p.speed(0f,3200);p.gear(8,3200);assertEquals("not_parked",p.state(5000));
  p.speed(Float.NaN,5100);assertEquals("unknown",p.state(5100));
  p.reset();assertEquals("unknown",p.state(6000));
 }
}
