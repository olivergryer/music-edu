// ─── Textes du module Rythme ──────────────────────────────────────────────────
// Source de vérité de TOUT le texte visible du module. Les icônes (SVG, emoji)
// restent dans les composants et sont appariées par clé — ce fichier ne contient
// que de la chaîne de caractères, pour qu'une relecture éditoriale n'ait jamais
// à traverser du JSX.
//
// Règles de rédaction :
//  · tutoiement partout, phrases courtes (lecture sur mobile, largeur ≤ 540 px)
//  · « Niveau » = cycle scolaire C1/1…C3. « Rang » = progression XP cross-module.
//    Ne jamais employer un nom de Rang (Apprenti, Virtuose, Maestro…) pour parler
//    de difficulté d'exercice — voir CLAUDE.md § Vocabulaire.
//  · interface 100 % française, aucun terme anglais visible.

export const RYTHME = {
  titre: 'Rythme',

  // ── Activités ──────────────────────────────────────────────────────────────
  // label  : nom court, carte de la grille d'accueil
  // court  : sous-titre d'une ligne (carousel du tutoriel)
  // resume : paragraphe de l'écran d'attente en jeu (phase idle)
  // consigne : lignes de l'overlay de consigne à l'arrivée sur l'activité
  activites: {
    1: {
      label: 'Reproduire vu',
      court: 'Reproduis ce que tu vois',
      resume: 'Un rythme s’affiche sur la portée. Reproduis-le en tapant au bon moment.',
      consigne: [
        'Un rythme s’affiche sur la portée.',
        'Le décompte affiche 1, 2, 3, 4. Tu joues la première note sur le temps qui suit le 4.',
        'Reproduis le rythme en tapant (ou au micro) en suivant le tempo.',
        'Tape ou chante des valeurs courtes : touche l’écran puis relève le doigt aussitôt.',
      ],
    },
    2: {
      label: 'Reproduire entendu',
      court: 'Reproduis ce que tu entends',
      resume: 'Écoute le rythme et reproduis-le en tapant. La portée reste cachée pendant le jeu.',
      consigne: [
        'Écoute le rythme : la portée reste cachée.',
        'Le décompte affiche 1, 2, 3, 4. Tu joues la première note sur le temps qui suit le 4.',
        'Reproduis ensuite le rythme en tapant au bon moment.',
        'Tape ou chante des valeurs courtes : touche l’écran puis relève le doigt aussitôt.',
      ],
    },
    3: {
      label: 'Reconnaître écrit',
      court: 'Identifie le rythme entendu parmi les 4 rythmes écrits',
      resume: 'Écoute le rythme joué et identifie la bonne portée parmi 4 propositions.',
      consigne: [
        'Écoute le rythme joué (après un décompte de 2 temps).',
        'Choisis, parmi les 4 portées, celle qui correspond.',
      ],
    },
    4: {
      label: 'Reconnaître joué',
      court: 'Identifie le rythme écrit parmi les 4 rythmes entendus',
      resume: 'Observe la portée et identifie parmi 4 lectures audio celle qui correspond.',
      consigne: [
        'Observe la portée affichée.',
        'Touche chaque proposition A/B/C/D pour les écouter une par une, puis choisis celle qui correspond.',
      ],
    },
    5: {
      label: 'Reconstituer',
      court: 'Reconstitue le rythme entendu en posant des cellules',
      resume: 'Écoute le rythme, puis reconstitue-le en posant des cellules rythmiques sur la portée. Score partiel selon la justesse.',
      consigne: [
        'Écoute le rythme, puis reconstitue-le en posant les cellules sur la portée.',
        'Valide pour voir ton score.',
      ],
    },
  },

  // ── Boutons détaillés dans la consigne d'arrivée ───────────────────────────
  controles: {
    rhythmSound: {
      nom: 'Son du rythme',
      desc: 'Active ou coupe la lecture sonore du rythme à reproduire.',
    },
    flash: {
      nom: 'Flash',
      desc: 'Fait clignoter le cadre à chaque temps — un repère visuel du tempo.',
    },
    tapSound: {
      nom: 'Son du tap',
      desc: 'Active ou coupe le son joué à chacune de tes frappes.',
    },
  },

  avertissements: {
    son: 'Monte le volume et désactive le mode silencieux de ton appareil — le son est nécessaire.',
  },

  // ── Popup « Ne pas déranger » au premier lancement ─────────────────────────
  dnd: {
    titre: 'Avant de jouer',
    corpsAvant: 'Pense à désactiver le mode ',
    modeDnd: 'Ne pas déranger',
    corpsOu: ' ou ',
    modeSilencieux: 'Silencieux',
    corpsApres: ' et monte le volume avant de commencer à jouer pour bien entendre les exercices.',
    nePlusAfficher: 'Ne plus afficher',
    valider: 'J’ai compris',
  },

  // ── Tutoriel d'accueil (3 diapositives) ────────────────────────────────────
  tutoriel: {
    slides: [
      {
        titre: 'Bienvenue dans Rythme !',
        corps: 'Entraîne-toi à reproduire et à reconnaître des rythmes musicaux, du premier au troisième cycle. Choisis ton activité ci-dessous.',
      },
      {
        titre: 'Tap ou Micro ?',
        corps: 'Comment vas-tu saisir le rythme ?',
      },
      {
        titre: 'Choisis ton niveau',
        corps: 'Tu pourras en changer à tout moment dans les réglages.',
      },
    ],
    ignorer: 'Ignorer',
    precedent: '← Précédent',
    suivant: 'Suivant →',
    commencer: '▶ Commencer !',
  },

  // ── Aide (bouton « ? ») ────────────────────────────────────────────────────
  aide: {
    titre: 'Aide',
    sousTitre: 'Que veux-tu consulter ?',
    consignes: 'Consignes',
    reglages: 'Réglages',
    fermer: 'Fermer',
  },

  // ── Popup d'explication des réglages ───────────────────────────────────────
  reglagesExpl: {
    titre: 'Réglages — Rythme',
    sousTitre: 'À quoi servent les options ?',
    fermer: 'Fermer',
    // `cle` fait le lien avec l'icône SVG correspondante dans RythmApp.jsx
    sections: [
      {
        cle: 'saisie',
        titre: 'Saisie',
        corps: 'TAP : touche l’écran au rythme. Micro : chante, frappe ou joue à l’instrument — la détection sonore valide chaque attaque.',
      },
      {
        cle: 'tempo',
        titre: 'Tempo',
        corps: 'Fixe (BPM choisi) ou variable (BPM tiré au hasard dans une plage min–max à chaque exercice).',
      },
      {
        cle: 'niveau',
        titre: 'Niveau',
        corps: 'Sélectionne les formules rythmiques par cycle scolaire (C1/1 → C3). Pilote la difficulté des rythmes et des distracteurs (act. 3, 4, 5).',
      },
      {
        cle: 'extreme',
        titre: 'Mode Extrême',
        corps: 'Activité 1 : son du rythme et flash bordure désactivés → score ×2. Cumulable avec le bonus de révélation.',
      },
      {
        cle: 'revelation',
        titre: 'Révélation',
        corps: 'Activité 1 uniquement : la portée n’apparaît qu’au temps 1, 2, 3 ou 4 du rythme. Plus tardif = bonus de score (+10 %, +20 %, +50 %).',
      },
      {
        cle: 'boutons',
        titre: 'Boutons en jeu',
        corps: 'Son du rythme, Flash et Son du tap : (dés)activables en cours d’exercice — détaillés dans la consigne d’arrivée.',
      },
    ],
  },

  // ── Modale de réglages (accordéon) ─────────────────────────────────────────
  reglages: {
    titre: 'Réglages',
    accordeon: {
      saisie: '① Saisie',
      tempo: '② Tempo',
      niveau: '③ Niveau · Formules',
      mode: '④ Mode de jeu',
      reveal: '⑤ Révélation',
    },
    saisieLabel: 'Mode de saisie (activités 1 & 2)',
    tap: 'TAP',
    micro: 'Micro',
    seuilDetection: 'Seuil détection',
    calibrer: 'Calibrer automatiquement',
    tempoFixe: 'Fixe',
    tempoVariable: 'Variable',
    tempoMin: 'Min',
    tempoMax: 'Max',
    uniteLecture: 'Unité de lecture',
    uniteNoire: 'Noire',
    uniteBlanche: 'Blanche',
    uniteCroche: 'Croche',
    detailFormules: 'Détail formules →',
    modeExerciceSeul: 'Exercice seul',
    modeSerie: 'Série de 10',
    revealLabel: 'Afficher la portée au temps… (activité 1)',
    avances: 'Réglages avancés (feuille CSV, calibration…)',
  },

  // ── Écran d'accueil du module ──────────────────────────────────────────────
  accueil: {
    retour: '← Tessitura',
    reglagesResume: 'Réglages',
    commencer: '▶ Commencer',
    commencerSerie: '▶ Commencer la série',
    modifier: 'modifier',
    ouvrirReglages: 'Ouvrir les réglages',
  },

  // ── En jeu ─────────────────────────────────────────────────────────────────
  jeu: {
    retourActivites: '← Activités',
    prepareToi: 'Prépare-toi…',
    memorise: 'Mémorise le rythme…',
    ecoute: 'Écoute le rythme…',
    aToiDeJouer: 'À toi de jouer !',
    zoneTap: 'Tape n’importe où',
    micEcoute: '🎤 Écoute…',
    micInactif: '🎤 Micro inactif',
    tapePourContinuer: 'Tape pour continuer →',
    taps: 'taps',
    extremeActive: 'Mode Extrême Activé',
    extremeScore: 'Score ×2',
    // Info-bulles du toggle Flash / Métronome (4 états)
    flashMetro: {
      off: 'Flash + Métro OFF',
      flashSeul: 'Flash seulement',
      metroSeul: 'Métro seulement',
      both: 'Flash + Métro ON',
    },
    flashBordureOn: 'Désactiver flash bordure',
    flashBordureOff: 'Activer flash bordure',
    sonTap: 'Son TAP',
    titreAide: 'Aide',
    titreReglages: 'Réglages',
  },

  // ── Résultats activités 1 & 2 ──────────────────────────────────────────────
  resultats12: {
    aucuneFrappe: 'Aucune frappe détectée.',
    reecouter: '▶ Réécouter',
    solution: '▶ Solution',
    rejouer: '↻ Rejouer',
    tropTard: 'trop tard',
    tropTot: 'trop tôt',
    compenses: 'compensés',
    aucuneCorrection: 'Aucune correction nécessaire',
  },

  // ── Diagnostic de frappe (bilan act. 1 & 2) ────────────────────────────────
  diagnostic: {
    tempo: 'Tempo',
    decalage: 'Décalage',
    regularite: 'Régularité',
    derive: 'Dérive',
    frappesEnTrop: 'Frappes en trop',
    frappesManquees: 'Frappes manquées',
    vide: '—',
    tempoJuste: 'Tempo juste',
    tempoRapide: (pct: number) => `Tu joues plus vite que le modèle (~${pct} %)`,
    tempoLent: (pct: number) => `Tu ralentis (~${pct} % trop lent)`,
    offsetBienCale: 'Bien calé',
    offsetRetard: (ms: number) => `Tu démarres en retard (~${ms} ms)`,
    offsetAvance: (ms: number) => `Tu démarres en avance (~${ms} ms)`,
    regIrregulier: 'Ton tempo est en dents de scie',
    regTresRegulier: 'Très régulier',
    regRegulier: 'Régulier',
    regAssezRegulier: 'Assez régulier',
    driftAccel: 'Tu accélères vers la fin',
    driftDecel: 'Tu ralentis vers la fin',
  },

  // ── Barème d'une frappe ────────────────────────────────────────────────────
  // `miss` = frappe jouée mais hors tolérance · `manque` = aucune frappe pour
  // cette note. Les deux apparaissent dans les pastilles du bilan.
  grades: {
    perfect: 'Parfait ✦',
    good: 'Bien ✓',
    ok: 'Moyen',
    miss: 'Raté ✕',
    manque: 'Manqué ✕',
  },

  // ── Activité 3 ─────────────────────────────────────────────────────────────
  act3: {
    question: 'Quelle portée ?',
    resultat: 'Résultat — touche une mesure pour la réécouter',
    reecouterMesure: '▶ Réécouter la mesure',
    bonneReponse: '✓ Bonne réponse ! +100 pts',
    mauvaiseReponse: '✕ Mauvaise réponse.',
  },

  // ── Activité 4 ─────────────────────────────────────────────────────────────
  act4: {
    ecoutePuisValide: 'Écoute puis valide',
    valider: (lettre: string) => `Valider : ${lettre}`,
    bonneReponse: '✓ Bonne réponse ! +100 pts',
    mauvaiseReponse: (lettre: string) => `✕ Mauvaise réponse. La bonne réponse était ${lettre}.`,
    taReponse: (lettre: string) => `Ta réponse — ${lettre} (touche pour réécouter)`,
  },

  // ── Activité 5 ─────────────────────────────────────────────────────────────
  act5: {
    enTete: 'Reconstitue le rythme',
    reecouter: '▶ Réécouter',
    annuler: 'Annuler',
    mesureComplete: '● Mesure complète',
    mesureTropLongue: '⚠ Mesure trop longue',
    mesureIncomplete: '○ Mesure incomplète',
    cellulesDisponibles: 'Cellules disponibles',
    valider: 'Valider',
    invalide: '✕ Exercice non valide',
    invalideDetailLongue: 'Mesure trop longue',
    invalideDetailIncomplete: 'Mesure incomplète',
    invalideSuffixe: ' — la métrique n’est pas respectée. Aucun point.',
    taReponse: 'Ta réponse — touche pour réécouter',
    solution: 'Solution',
    aucuneCellule: '(aucune cellule posée)',
  },

  // ── Fin de série ───────────────────────────────────────────────────────────
  serie: {
    titre: 'Série terminée !',
    parfaite: 'Série parfaite — incroyable !',
    scoreTotal: (xp: number) => `Score total : +${xp} XP`,
    detail: 'Détail de la série',
    xpGagne: 'XP gagné',
    tropheeDebloque: 'Trophée débloqué !',
    tropheesDebloques: 'Trophées débloqués !',
    rangSuperieur: 'Rang supérieur !',
    retour: '← Activités',
    rejouer: '🔄 Rejouer la série',
  },

  // ── Erreurs ────────────────────────────────────────────────────────────────
  erreurs: {
    figuresInsuffisantes:
      'Pas assez de figures pour générer 3 réponses distinctes dans ce mode. Sélectionne davantage de figures.',
    microRefuse: 'Microphone refusé',
  },

  // ── Démo animée du décompte (consigne act. 1 & 2) ──────────────────────────
  demo: {
    titre: 'Comment démarrer',
    etapeDecompte: 'Décompte — ne joue pas encore',
    etapeMemorise: 'La portée apparaît : mémorise',
    etapeDernierTemps: 'Dernier temps du décompte',
    etapeDepart: 'C’est à toi !',
    legendeStatique:
      'Le décompte affiche 1, 2, 3 puis 4. Tu joues la première note sur le temps qui suit immédiatement le 4.',
    rejouer: '▶ Revoir',
  },
} as const
