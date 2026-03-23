; ============================================================
; MeoMeoBot Custom Dark Theme Installer
; Colors from global.css:
;   --bg-primary:   #0e0e10
;   --bg-secondary: #18181b
;   --accent:       #9147ff
;   --text-primary: #efeff1
; ============================================================

!macro customHeader
  ; Undefine defaults before redefining
  !ifdef MUI_BGCOLOR
    !undef MUI_BGCOLOR
  !endif
  !ifdef MUI_TEXTCOLOR
    !undef MUI_TEXTCOLOR
  !endif
  !ifdef MUI_INSTFILESPAGE_COLORS
    !undef MUI_INSTFILESPAGE_COLORS
  !endif
  !ifdef MUI_INSTFILESPAGE_PROGRESSBAR
    !undef MUI_INSTFILESPAGE_PROGRESSBAR
  !endif

  !define MUI_BGCOLOR "0e0e10"
  !define MUI_TEXTCOLOR "efeff1"
  !define MUI_INSTFILESPAGE_COLORS "efeff1 18181b"
  !define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!macroend
