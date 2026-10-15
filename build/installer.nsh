; Explorer context menu: "Open in Git Viewer" on folders and folder backgrounds.
; "%V\." keeps a drive root (C:\) from ending in \" which would escape the closing quote.
!macro customInstall
  WriteRegStr SHCTX "Software\Classes\Directory\shell\GitViewer" "" "Open in Git Viewer"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\GitViewer" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr SHCTX "Software\Classes\Directory\shell\GitViewer\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V\."'
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\GitViewer" "" "Open in Git Viewer"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\GitViewer" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr SHCTX "Software\Classes\Directory\Background\shell\GitViewer\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V\."'
!macroend

!macro customUnInstall
  DeleteRegKey SHCTX "Software\Classes\Directory\shell\GitViewer"
  DeleteRegKey SHCTX "Software\Classes\Directory\Background\shell\GitViewer"
!macroend
