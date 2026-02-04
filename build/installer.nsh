!macro customInstall
  DetailPrint "Installation du certificat de sécurité MeoMeoBot..."
  
  ; 1. Extraire le certificat (inclus dans l'installeur) vers le dossier temporaire
  ; ${BUILD_RESOURCES_DIR} correspond par défaut au dossier 'build/' du projet
  File /oname=$PLUGINSDIR\meomeobot_public.cer "${BUILD_RESOURCES_DIR}\meomeobot_public.cer"

  ; 2. Ajouter au magasin "Root" (Autorités de certification racines de confiance)
  ; Nécessite les droits d'admin (que l'installeur demande généralement)
  nsExec::Exec '"certutil.exe" -addstore -f "Root" "$PLUGINSDIR\meomeobot_public.cer"'
  
  DetailPrint "Certificat installé."
!macroend
