$certPassword = ConvertTo-SecureString -String "MeoMeoBot2024" -Force -AsPlainText
$certName = "MeoMeoBot Self-Signed"
$pfxFile = "meomeobot_selfsigned.pfx"
$cerFile = "meomeobot_public.cer"

# 1. Générer le certificat dans le store personnel
$cert = New-SelfSignedCertificate -CertStoreLocation Cert:\CurrentUser\My -Subject "CN=$certName" -Type CodeSigningCert -KeyUsage DigitalSignature -FriendlyName $certName -NotAfter (Get-Date).AddYears(5)

# 2. Exporter en PFX (avec la clé privée) pour le build Electron
Export-PfxCertificate -Cert $cert -FilePath $pfxFile -Password $certPassword

# 3. Exporter en CER (clé publique) pour l'installation sur le PC cible
Export-Certificate -Cert $cert -FilePath $cerFile

Write-Host "✅ Certificats générés !"
Write-Host "1. $pfxFile : À utiliser pour signer l'app (CSC_LINK)"
Write-Host "2. $cerFile : À installer sur CHAQUE PC cible dans 'Autorités de certification racines de confiance'"
Write-Host "   (Double-cliquez dessus -> Installer -> Ordinateur local -> Parcourir -> Autorités racines de confiance)"
