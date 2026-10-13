# 🐷 Pécule — gestion de budget personnel

Pécule est une application web pour gérer son budget : on y saisit ses revenus et ses dépenses, on voit ce qu'il reste à épargner, on fixe des budgets avec des alertes, on met de l'argent de côté pour ses projets et on anticipe les mois à venir.

Pas de compte, pas de serveur : **les données restent dans le navigateur** (localStorage). On peut exporter et importer une sauvegarde.

## Lancer l'application

- **Le plus simple** : ouvrir `index.html` dans un navigateur (double-clic).
- **Avec un petit serveur local** : `npm start` puis aller sur <http://localhost:8080>.
- **En ligne** : le site est 100 % statique, il peut être publié tel quel sur GitHub Pages, Netlify, etc.

Au premier lancement, vous pouvez **explorer avec des données d'exemple** ou **commencer avec votre budget** (un petit assistant demande le salaire, le loyer et l'épargne déjà disponible).

## Fonctionnalités

| Page | Ce qu'elle fait |
|---|---|
| **Tableau de bord** | Revenus, dépenses, épargne et reste disponible par **semaine, mois ou année** ; taux d'épargne ; **prévision de fin de mois** et montant qu'on peut encore dépenser par jour ; répartition des dépenses ; historique sur 6 mois ; budgets et objectifs en un coup d'œil. |
| **Opérations** | Saisie, modification et recherche des opérations, filtres par type et catégorie, export CSV. **Opérations récurrentes** (salaire, loyer, abonnements…) ajoutées automatiquement à chaque échéance (hebdo, mensuel, annuel). |
| **Budgets & alertes** | Une enveloppe mensuelle par catégorie et un **plafond global**. **Seuil d'alerte** réglable (80 % par défaut, modifiable catégorie par catégorie) : notification quand le seuil est atteint, puis quand le budget est dépassé. Suggestion automatique de budgets à partir de l'historique. |
| **Objectifs** | Cagnottes pour un voyage, des sorties, des restos, un fonds d'urgence… Montant visé, échéance, **effort mensuel et hebdomadaire** à fournir, suivi « dans les temps / en retard », et **répartition conseillée** du reste du mois entre les objectifs. |
| **Prévisions** | Détail de la fin du mois en cours, **dépenses et rentrées exceptionnelles** à venir (vacances, prime, impôts…), projection de l'épargne sur 6 à 36 mois et **simulateur de scénario** (« et si je réduisais mes dépenses variables de 20 % ? »). |
| **Économies** | Analyse **50/30/20** (besoins / envies / épargne), catégories en hausse, coût annuel des abonnements, effet des petites dépenses, gain d'une baisse de 10 %, épargne de précaution conseillée, astuces. |
| **Placements** | Capacité d'épargne réelle, ordre conseillé (précaution → projets → long terme), profils prudent / équilibré / dynamique, **simulateur d'intérêts composés** et comparaison des supports (livrets, assurance vie, ETF, SCPI…). Contenu pédagogique, pas un conseil en investissement ; les taux sont indicatifs et modifiables. |
| **Réglages** | Prénom, épargne disponible, thème clair/sombre, catégories personnalisées, taux des placements, sauvegarde / import / remise à zéro. |

## Structure du code

```
index.html        Page unique et navigation
css/style.css     Styles (thème clair/sombre, responsive mobile)
js/core.js        Logique métier pure : dates, récurrences, synthèses, budgets, alertes, prévisions, conseils, simulations
js/store.js       Persistance localStorage, catégories par défaut, données d'exemple
js/charts.js      Graphiques SVG (donut, barres, courbes) sans dépendance
js/ui.js          Formatage, modales, notifications
js/app.js         État, rendu, formulaires et actions
js/views.js       Rendu de chaque page
tests/            Tests de la logique métier (node:test)
```

Aucune dépendance ni étape de build. Les tests se lancent avec `npm test` (Node 18+).
