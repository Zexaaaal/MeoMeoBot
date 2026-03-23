; ============================================================
; MeoMeoBot Custom Dark Theme Installer
; Colors from global.css:
;   --bg-primary:   #0e0e10
;   --bg-secondary: #18181b
;   --accent:       #9147ff
;   --text-primary: #efeff1
; ============================================================

; --- Dark background & light text for the installer window ---
!macro customHeader
  !define MUI_BGCOLOR "0e0e10"
  !define MUI_TEXTCOLOR "efeff1"

  ; Instfiles page: dark background with purple progress bar highlight
  !define MUI_INSTFILESPAGE_COLORS "efeff1 18181b"
  !define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
!macroend
