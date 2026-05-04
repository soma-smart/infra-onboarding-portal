# infra-onboarding-portal

Portail statique déployé sur GitHub Pages. Les nouveaux arrivants soumettent leur email et clé SSH publique via un formulaire. La soumission crée une issue GitHub (labels : `onboarding` + `pending`). Un administrateur ajoute le label `approved` pour déclencher l'onboarding automatique.

## Stack

- Frontend : HTML/CSS/JS statique hébergé sur GitHub Pages
- Intégration : GitHub Issues API (création via PAT) + GitHub Actions (runner on-prem)

## Flux

1. Utilisateur soumet le formulaire → issue créée avec les labels `onboarding` + `pending`
2. Admin examine la demande et ajoute le label `approved`
3. Workflow `onboard.yml` déclenché sur le runner on-prem
4. Script `infra-datacenter-docs/scripts/onboard-devops-user.sh` : clé SSH propagée sur les 3 nœuds k3s (+ groupe Entra ID si une application est sélectionnée)
5. Commentaire automatique sur l'issue + fermeture avec label `done`

## Prérequis admin

### Runner

Runner GitHub Actions auto-hébergé avec le label `onprem-onboarding`, ayant accès SSH aux nœuds k3s (`10.0.30.200`, `10.0.30.201`, `10.0.30.202`).

### Secrets GitHub requis

| Secret | Usage |
|---|---|
| `GITHUB_PAT` | Création d'issues depuis le formulaire (injecté au build) |
| `INFRA_REPO_PAT` | Clone du repo `infra-datacenter-docs` |
| `ONBOARD_SSH_PRIVATE_KEY` | Accès SSH aux nœuds k3s |
| `AZURE_CLIENT_ID` | Auth service principal Azure (Entra ID) |
| `AZURE_CLIENT_SECRET` | Auth service principal Azure (Entra ID) |
| `AZURE_TENANT_ID` | Auth service principal Azure (Entra ID) |

### Déploiement

Le workflow `deploy-pages.yml` remplace le placeholder `__GITHUB_PAT__` dans `index.html` par le secret avant publication sur GitHub Pages. Ne pas committer de PAT en clair dans `index.html`.
