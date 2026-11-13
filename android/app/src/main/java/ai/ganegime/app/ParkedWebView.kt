package ai.ganegime.app

import android.content.Context
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import android.view.inputmethod.InputConnectionWrapper
import android.view.inputmethod.CompletionInfo
import android.view.inputmethod.CorrectionInfo
import android.view.inputmethod.InputContentInfo
import android.view.inputmethod.TextAttribute
import android.os.Bundle
import android.webkit.WebView

/** Recheck an already-open keyboard's connection after a vehicle-state change. */
class ParkedWebView(context:Context, private val canEdit:()->Boolean):WebView(context) {
    override fun dispatchTouchEvent(event:MotionEvent)=if(canEdit())super.dispatchTouchEvent(event) else true
    override fun dispatchKeyEvent(event:KeyEvent)=if(canEdit())super.dispatchKeyEvent(event) else true
    override fun onCreateInputConnection(info:EditorInfo):InputConnection? {
        if(!canEdit())return null
        val connection=super.onCreateInputConnection(info)?:return null
        return object:InputConnectionWrapper(connection,false) {
            override fun commitText(text:CharSequence?,cursor:Int)=canEdit() && super.commitText(text,cursor)
            override fun commitText(text:CharSequence,cursor:Int,attributes:TextAttribute?)=canEdit() && super.commitText(text,cursor,attributes)
            override fun commitCompletion(info:CompletionInfo?)=canEdit() && super.commitCompletion(info)
            override fun commitCorrection(info:CorrectionInfo?)=canEdit() && super.commitCorrection(info)
            override fun commitContent(info:InputContentInfo,flags:Int,opts:Bundle?)=canEdit() && super.commitContent(info,flags,opts)
            override fun performPrivateCommand(action:String?,data:Bundle?)=canEdit() && super.performPrivateCommand(action,data)
            override fun replaceText(start:Int,end:Int,text:CharSequence,cursor:Int,attributes:TextAttribute?)=canEdit() && super.replaceText(start,end,text,cursor,attributes)
            override fun setComposingText(text:CharSequence?,cursor:Int)=canEdit() && super.setComposingText(text,cursor)
            override fun setComposingText(text:CharSequence,cursor:Int,attributes:TextAttribute?)=canEdit() && super.setComposingText(text,cursor,attributes)
            override fun finishComposingText()=canEdit() && super.finishComposingText()
            override fun deleteSurroundingText(before:Int,after:Int)=canEdit() && super.deleteSurroundingText(before,after)
            override fun deleteSurroundingTextInCodePoints(before:Int,after:Int)=canEdit() && super.deleteSurroundingTextInCodePoints(before,after)
            override fun sendKeyEvent(event:KeyEvent)=canEdit() && super.sendKeyEvent(event)
            override fun performEditorAction(action:Int)=canEdit() && super.performEditorAction(action)
            override fun performContextMenuAction(id:Int)=canEdit() && super.performContextMenuAction(id)
            override fun setSelection(start:Int,end:Int)=canEdit() && super.setSelection(start,end)
            override fun setComposingRegion(start:Int,end:Int)=canEdit() && super.setComposingRegion(start,end)
            override fun setComposingRegion(start:Int,end:Int,attributes:TextAttribute?)=canEdit() && super.setComposingRegion(start,end,attributes)
        }
    }
}

