let FONTS = [
    { label: 'Par défaut (sans-serif)', value: 'sans-serif' }
];

export function setFonts(fontNames) {
    FONTS.length = 1;
    fontNames.forEach(name => {
        const fontValue = name.includes(' ') ? `'${name}', sans-serif` : `${name}, sans-serif`;
        FONTS.push({ label: name, value: fontValue });
    });
}

const ANIMATIONS = [
    { label: 'Aucune', value: 'none' },
    { label: 'Glisser du bas', value: 'slideInBottom' },
    { label: 'Glisser du haut', value: 'slideInTop' },
    { label: 'Glisser de gauche', value: 'slideInLeft' },
    { label: 'Glisser de droite', value: 'slideInRight' },
    { label: 'Fondu', value: 'fadeIn' },
    { label: 'Zoom', value: 'zoomIn' },
    { label: 'Rebond', value: 'bounceIn' }
];

const BORDER_STYLES = [
    { label: 'Aucune', value: 'none' },
    { label: 'Solide', value: 'solid' },
    { label: 'Pointillée', value: 'dashed' },
    { label: 'Points', value: 'dotted' },
    { label: 'Double', value: 'double' }
];

const FONT_WEIGHTS = [
    { label: 'Léger (300)', value: '300' },
    { label: 'Normal (400)', value: '400' },
    { label: 'Medium (500)', value: '500' },
    { label: 'Semi-gras (600)', value: '600' },
    { label: 'Gras (700)', value: '700' },
    { label: 'Extra-gras (800)', value: '800' }
];

const TEXT_ALIGNS = [
    { label: 'Gauche', value: 'left' },
    { label: 'Centre', value: 'center' },
    { label: 'Droite', value: 'right' }
];

export const BUILDER_SCHEMA = {

    // ─── Chat ───────────────────────────────────────────────────────────

    chat: [
        {
            label: 'Conteneur',
            selector: '#chat-container',
            props: [
                { key: 'padding', type: 'spacing', label: 'Padding', default: '10px 10px 24px 10px' },
                { key: 'gap', type: 'slider', label: 'Espacement', min: 0, max: 40, unit: 'px', default: 10 },
                {
                    key: 'justify-content', type: 'select', label: 'Position verticale', options: [
                        { label: 'En bas', value: 'flex-end' },
                        { label: 'En haut', value: 'flex-start' },
                        { label: 'Centré', value: 'center' }
                    ], default: 'flex-end'
                }
            ]
        },
        {
            label: 'Bloc de messages',
            selector: '.msg-group',
            props: [
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(0, 0, 0, 0.3)' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 50, unit: 'px', default: 12 },
                { key: 'border-style', type: 'select', label: 'Type de bordure', options: BORDER_STYLES, default: 'solid' },
                { key: 'border-width', type: 'slider', label: 'Épaisseur bordure', min: 0, max: 10, unit: 'px', default: 1 },
                { key: 'border-color', type: 'color-alpha', label: 'Couleur bordure', default: 'rgba(255, 255, 255, 0.08)' },
                { key: 'padding', type: 'slider', label: 'Padding', min: 0, max: 40, unit: 'px', default: 10 },
                { key: 'margin-bottom', type: 'slider', label: 'Marge inférieure', min: 0, max: 30, unit: 'px', default: 0 },
                { key: 'backdrop-filter', type: 'blur', label: 'Flou arrière-plan', max: 30, default: 0 },
                { key: 'box-shadow', type: 'box-shadow', label: 'Ombre', default: 'none' },
                { key: 'animation-name', type: 'select', label: 'Animation', options: ANIMATIONS, default: 'slideInBottom' },
                { key: 'animation-duration', type: 'slider', label: 'Durée animation', min: 0.1, max: 2, step: 0.1, unit: 's', default: 0.3 },
                { key: '--user-color-bg', type: 'toggle', label: 'Fond dépendant couleur pseudo', default: false }
            ]
        },
        {
            label: 'Pseudo',
            selector: '.msg-username',
            props: [
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 10, max: 48, unit: 'px', default: 14 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '700' },
                { key: 'color', type: 'color', label: 'Couleur', default: '#6dd4ff', useUserColor: true },
                { key: 'margin-bottom', type: 'slider', label: 'Marge sous pseudo', min: 0, max: 20, unit: 'px', default: 4 },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: 'none' },
                {
                    key: 'text-transform', type: 'select', label: 'Casse', options: [
                        { label: 'Normal', value: 'none' },
                        { label: 'MAJUSCULES', value: 'uppercase' },
                        { label: 'minuscules', value: 'lowercase' },
                        { label: 'Capitalize', value: 'capitalize' }
                    ], default: 'none'
                }
            ]
        },
        {
            label: 'Messages',
            selector: '.msg-line',
            props: [
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 10, max: 48, unit: 'px', default: 14 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '400' },
                { key: 'color', type: 'color', label: 'Couleur', default: '#e7eef5' },
                { key: 'line-height', type: 'slider', label: 'Interligne', min: 1, max: 3, step: 0.1, unit: '', default: 1.4 },
                { key: 'margin-bottom', type: 'slider', label: 'Espacement entre lignes', min: 0, max: 20, unit: 'px', default: 2 },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: 'none' }
            ]
        },
        {
            label: 'Badges',
            selector: '.badge-img',
            props: [
                { key: 'width', type: 'slider', label: 'Taille', min: 10, max: 40, unit: 'px', default: 18 },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 20, unit: 'px', default: 0 },
                { key: 'margin-right', type: 'slider', label: 'Marge droite', min: 0, max: 10, unit: 'px', default: 2 }
            ]
        }
    ],

    spotify: [
        {
            label: 'Conteneur principal',
            selector: '#spotify-wrapper',
            props: [
                {
                    key: 'justify-content', type: 'select', label: 'Position horizontale', options: [
                        { label: 'Centré', value: 'center' },
                        { label: 'Gauche', value: 'flex-start' },
                        { label: 'Droite', value: 'flex-end' }
                    ], default: 'center'
                },
                {
                    key: 'align-items', type: 'select', label: 'Position verticale', options: [
                        { label: 'Centré', value: 'center' },
                        { label: 'Haut', value: 'flex-start' },
                        { label: 'Bas', value: 'flex-end' }
                    ], default: 'center'
                }
            ]
        },
        {
            label: 'Carte',
            selector: '.spotify-card',
            props: [
                { key: 'gap', type: 'slider', label: 'Espacement', min: 0, max: 40, unit: 'px', default: 12 },
                { key: 'padding', type: 'slider', label: 'Padding', min: 0, max: 40, unit: 'px', default: 14 },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 50, unit: 'px', default: 16 },
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(0, 0, 0, 0.35)' },
                { key: 'border-style', type: 'select', label: 'Type de bordure', options: BORDER_STYLES, default: 'solid' },
                { key: 'border-width', type: 'slider', label: 'Épaisseur bordure', min: 0, max: 10, unit: 'px', default: 1 },
                { key: 'border-color', type: 'color-alpha', label: 'Couleur bordure', default: 'rgba(255, 255, 255, 0.08)' },
                { key: 'box-shadow', type: 'box-shadow', label: 'Ombre', default: '0px 15px 40px #000000' },
                { key: 'backdrop-filter', type: 'blur', label: 'Flou arrière-plan', max: 30, default: 8 },
                { key: 'color', type: 'color', label: 'Couleur du texte', default: '#f5f7fb' }
            ]
        },
        {
            label: 'Pochette',
            selector: '.spotify-cover',
            props: [
                { key: 'width', type: 'slider', label: 'Largeur', min: 60, max: 300, unit: 'px', default: 140 },
                { key: 'height', type: 'slider', label: 'Hauteur', min: 60, max: 300, unit: 'px', default: 140 },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 50, unit: 'px', default: 12 },
                { key: 'box-shadow', type: 'box-shadow', label: 'Ombre', default: '0px 10px 25px #000000' }
            ]
        },
        {
            label: 'Titre',
            selector: '.spotify-title',
            props: [
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 10, max: 48, unit: 'px', default: 20 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '700' },
                { key: 'color', type: 'color', label: 'Couleur', default: '#f5f7fb' },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: 'none' }
            ]
        },
        {
            label: 'Artiste',
            selector: '.spotify-artist',
            props: [
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 10, max: 48, unit: 'px', default: 16 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '400' },
                { key: 'color', type: 'color', label: 'Couleur', default: '#cdd7e5' },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: 'none' }
            ]
        },
        {
            label: 'Album',
            selector: '.spotify-album',
            props: [
                {
                    key: 'display', type: 'select', label: 'Afficher', options: [
                        { label: 'Oui', value: 'block' },
                        { label: 'Non', value: 'none' }
                    ], default: 'block'
                },
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 10, max: 48, unit: 'px', default: 14 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '400' },
                { key: 'color', type: 'color', label: 'Couleur', default: '#9fb4d1' },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: 'none' }
            ]
        },
        {
            label: 'Badge "En lecture"',
            selector: '.pill',
            props: [
                {
                    key: 'display', type: 'select', label: 'Afficher', options: [
                        { label: 'Oui', value: 'inline-flex' },
                        { label: 'Non', value: 'none' }
                    ], default: 'inline-flex'
                },
                { key: 'padding', type: 'spacing', label: 'Padding', default: '4px 10px' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 50, unit: 'px', default: 999 },
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(255, 255, 255, 0.08)' },
                { key: 'font-size', type: 'slider', label: 'Taille du texte', min: 8, max: 24, unit: 'px', default: 12 },
                { key: 'color', type: 'color', label: 'Couleur du texte', default: '#d3deef' },
                {
                    key: 'text-transform', type: 'select', label: 'Casse', options: [
                        { label: 'Normal', value: 'none' },
                        { label: 'MAJUSCULES', value: 'uppercase' },
                        { label: 'minuscules', value: 'lowercase' }
                    ], default: 'uppercase'
                }
            ]
        }
    ],

    subgoals: [
        {
            label: 'Conteneur',
            selector: '#widget-container',
            props: [
                { key: 'padding', type: 'slider', label: 'Padding', min: 0, max: 60, unit: 'px', default: 20 },
                {
                    key: 'justify-content', type: 'select', label: 'Position verticale', options: [
                        { label: 'Centré', value: 'center' },
                        { label: 'Haut', value: 'flex-start' },
                        { label: 'Bas', value: 'flex-end' }
                    ], default: 'center'
                },
                {
                    key: 'align-items', type: 'select', label: 'Alignement', options: [
                        { label: 'Centré', value: 'center' },
                        { label: 'Gauche', value: 'flex-start' },
                        { label: 'Droite', value: 'flex-end' }
                    ], default: 'center'
                }
            ]
        },
        {
            label: 'Barre de progression (conteneur)',
            selector: '.progress-container',
            props: [
                { key: 'height', type: 'slider', label: 'Hauteur', min: 10, max: 80, unit: 'px', default: 40 },
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(0, 0, 0, 0.5)' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 40, unit: 'px', default: 20 },
                { key: 'border-style', type: 'select', label: 'Type de bordure', options: BORDER_STYLES, default: 'solid' },
                { key: 'border-width', type: 'slider', label: 'Épaisseur bordure', min: 0, max: 10, unit: 'px', default: 2 },
                { key: 'border-color', type: 'color-alpha', label: 'Couleur bordure', default: 'rgba(255, 255, 255, 0.2)' }
            ]
        },
        {
            label: 'Barre de progression (remplissage)',
            selector: '.progress-bar',
            props: [
                { key: 'background', type: 'gradient', label: 'Dégradé', default: 'linear-gradient(90deg, #ff00cc, #333399)' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 40, unit: 'px', default: 18 },
                { key: 'box-shadow', type: 'box-shadow', label: 'Lueur', default: 'none' }
            ]
        },
        {
            label: 'Texte de progression',
            selector: '.progress-text',
            props: [
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 0.5, max: 4, unit: 'rem', step: 0.1, default: 1.2 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '800' },
                { key: 'color', type: 'color', label: 'Couleur', default: '#ffffff' },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: '0px 2px 4px #000000' }
            ]
        },
        {
            label: 'Marqueurs d\'étape',
            selector: '.step-marker',
            props: [
                { key: 'width', type: 'slider', label: 'Épaisseur', min: 1, max: 6, unit: 'px', default: 2 },
                { key: 'background', type: 'color-alpha', label: 'Couleur', default: 'rgba(255, 255, 255, 0.8)' }
            ]
        },
        {
            label: 'Étiquettes d\'étape',
            selector: '.step-label',
            props: [
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(0, 0, 0, 0.8)' },
                { key: 'color', type: 'color', label: 'Couleur du texte', default: '#ffffff' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 0.5, max: 3, unit: 'rem', step: 0.1, default: 0.9 },
                { key: 'padding', type: 'spacing', label: 'Padding', default: '6px 10px' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 20, unit: 'px', default: 6 },
                { key: 'border-style', type: 'select', label: 'Type de bordure', options: BORDER_STYLES, default: 'solid' },
                { key: 'border-width', type: 'slider', label: 'Épaisseur bordure', min: 0, max: 5, unit: 'px', default: 1 },
                { key: 'border-color', type: 'color-alpha', label: 'Couleur bordure', default: 'rgba(255, 255, 255, 0.3)' },
                { key: 'box-shadow', type: 'box-shadow', label: 'Ombre', default: '0px 4px 6px #000000' }
            ]
        }
    ],

    'subgoals-list': [
        {
            label: 'Conteneur',
            selector: '#widget-container',
            props: [
                { key: 'padding', type: 'slider', label: 'Padding', min: 0, max: 60, unit: 'px', default: 20 },
                {
                    key: 'justify-content', type: 'select', label: 'Position verticale', options: [
                        { label: 'Centré', value: 'center' },
                        { label: 'Haut', value: 'flex-start' },
                        { label: 'Bas', value: 'flex-end' }
                    ], default: 'center'
                },
                {
                    key: 'align-items', type: 'select', label: 'Alignement', options: [
                        { label: 'Gauche', value: 'flex-start' },
                        { label: 'Centré', value: 'center' },
                        { label: 'Droite', value: 'flex-end' }
                    ], default: 'flex-start'
                }
            ]
        },
        {
            label: 'Liste',
            selector: '.subgoals-list',
            props: [
                { key: 'gap', type: 'slider', label: 'Espacement', min: 0, max: 30, unit: 'px', default: 10 }
            ]
        },
        {
            label: 'Élément',
            selector: '.subgoal-item',
            props: [
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 0.5, max: 4, unit: 'rem', step: 0.1, default: 1.2 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '600' },
                { key: 'gap', type: 'slider', label: 'Espacement icône/texte', min: 0, max: 30, unit: 'px', default: 10 },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: '0px 2px 4px #000000' }
            ]
        },
        {
            label: 'Compteur de subs',
            selector: '.subgoal-count',
            props: [
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '800' },
                { key: 'color', type: 'color', label: 'Couleur', default: '#ff00cc' }
            ]
        },
        {
            label: 'Titre de l\'objectif',
            selector: '.subgoal-label',
            props: [
                { key: 'color', type: 'color', label: 'Couleur', default: '#ffffff' }
            ]
        }
    ],

    roulette: [
        {
            label: 'Conteneur de la roue',
            selector: '#wheel-container',
            props: [
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(0, 0, 0, 0)' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 50, unit: 'px', default: 0 },
                { key: 'padding', type: 'slider', label: 'Padding', min: 0, max: 40, unit: 'px', default: 0 }
            ]
        },
        {
            label: 'Conteneur de la liste',
            selector: '#list-container',
            props: [
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(0, 0, 0, 0)' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 30, unit: 'px', default: 0 },
                { key: 'border-style', type: 'select', label: 'Type de bordure', options: BORDER_STYLES, default: 'none' },
                { key: 'border-width', type: 'slider', label: 'Épaisseur bordure', min: 0, max: 6, unit: 'px', default: 0 },
                { key: 'border-color', type: 'color-alpha', label: 'Couleur bordure', default: 'rgba(255, 255, 255, 0.2)' }
            ]
        },
        {
            label: 'Élément de la liste',
            selector: '.list-item',
            props: [
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 10, max: 48, unit: 'px', default: 16 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '400' },
                { key: 'color', type: 'color', label: 'Couleur du texte', default: '#ffffff' },
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(0, 0, 0, 0)' },
                { key: 'padding', type: 'spacing', label: 'Padding', default: '8px 16px' },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: 'none' }
            ]
        },
        {
            label: 'Marqueur central',
            selector: '.list-center-marker',
            props: [
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(255, 255, 255, 0.15)' },
                { key: 'border-style', type: 'select', label: 'Type de bordure', options: BORDER_STYLES, default: 'solid' },
                { key: 'border-width', type: 'slider', label: 'Épaisseur bordure', min: 0, max: 6, unit: 'px', default: 2 },
                { key: 'border-color', type: 'color-alpha', label: 'Couleur bordure', default: 'rgba(255, 255, 255, 0.5)' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 20, unit: 'px', default: 6 }
            ]
        },
        {
            label: 'Affichage du gagnant',
            selector: '#winner-display',
            props: [
                { key: 'font-family', type: 'font', label: 'Police', options: FONTS, default: 'sans-serif' },
                { key: 'font-size', type: 'slider', label: 'Taille', min: 16, max: 72, unit: 'px', default: 32 },
                { key: 'font-weight', type: 'select', label: 'Épaisseur', options: FONT_WEIGHTS, default: '700' },
                { key: 'color', type: 'color', label: 'Couleur du texte', default: '#ffffff' },
                { key: 'background', type: 'color-alpha', label: 'Couleur de fond', default: 'rgba(0, 0, 0, 0.7)' },
                { key: 'border-radius', type: 'slider', label: 'Arrondi', min: 0, max: 30, unit: 'px', default: 12 },
                { key: 'padding', type: 'spacing', label: 'Padding', default: '16px 32px' },
                { key: 'text-shadow', type: 'text-shadow', label: 'Ombre du texte', default: 'none' },
                { key: 'box-shadow', type: 'box-shadow', label: 'Ombre', default: 'none' }
            ]
        }
    ]
};

export { FONTS, ANIMATIONS, BORDER_STYLES, FONT_WEIGHTS };
