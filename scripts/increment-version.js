const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const packageJsonPath = path.join(__dirname, '..', 'package.json');

try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const currentVersion = packageJson.version;

    let previousVersion;
    try {
        const gitShowOutput = execSync('git show HEAD:package.json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        const previousPackageJson = JSON.parse(gitShowOutput);
        previousVersion = previousPackageJson.version;
    } catch (e) {
        console.log('⚠️ Impossible de lire la version précédente (nouveau repo ?). Pas d\'incrément.');
        process.exit(0);
    }

    console.log(`ℹ️ Version précédente (HEAD) : ${previousVersion}`);
    console.log(`ℹ️ Version actuelle (Disque) : ${currentVersion}`);

    if (currentVersion !== previousVersion) {
        console.log('✅ La version a été modifiée manuellement. On respecte votre choix.');
        process.exit(0);
    }

    const versionParts = currentVersion.split('.').map(Number);
    if (versionParts.length !== 3) {
        console.error('❌ Erreur: Format de version invalide (attendu x.y.z)');
        process.exit(1);
    }

    versionParts[2] += 1;
    const newVersion = versionParts.join('.');

    console.log(`🚀 Auto-incrément : ${currentVersion} -> ${newVersion}`);
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    execSync(`git add "${packageJsonPath}"`);
    console.log('✅ package.json mis à jour et ajouté au commit.');

} catch (error) {
    console.error('❌ Erreur lors du versioning automatique :', error);
    process.exit(1);
}
