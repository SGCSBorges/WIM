// Translation keys added after translations.ts was already large. Instead
// of churning the 70KB main file every time we add a copy string, new
// keys live here. The i18n provider merges extras into the lookup chain:
//
//   extras[lang][key] → translations[lang][key]
//                     → extras.en[key] → translations.en[key] → key
//
// So extras CAN override an existing key (good for copy fixes) and CAN
// add new keys (TS picks them up via the ExtrasKey union below).
export const extras = {
  en: {
    "articles.table.image": "Image",

    "shared.editing.note":
      "Editing on behalf of the owner. Warranty and locations are not editable here.",
    "shared.permission.read.tooltip":
      "Read-only. Only the owner can edit this article.",
    "shared.permission.write.tooltip":
      "The owner gave you write access; your edits sync back to their inventory.",
    "shared.source.user": "Direct",
    "shared.source.user.tooltip": "Shared with you specifically by the owner.",
    "shared.source.global": "Public",
    "shared.source.global.tooltip":
      "The owner made this article visible to every Power User.",

    "acceptInvite.title": "Have an invite?",
    "acceptInvite.subtitle":
      "Paste a share-invite token to gain access to someone else's inventory.",
    "acceptInvite.placeholder": "Paste invite token here…",
    "acceptInvite.submit": "Accept invite",
    "acceptInvite.success":
      "Invite accepted. You now have {permission} access.",
    "acceptInvite.error.tokenRequired": "Token is required.",
    "acceptInvite.error.default": "Could not accept this invite.",

    "theme.cyber": "Cyber",

    "profile.share.public.title": "Articles you've shared publicly",
    "profile.share.public.subtitle":
      "Visible read-only to every Power User. Unshare any article (or all of them) here.",
    "profile.share.public.empty": "You haven't shared any articles publicly.",
    "profile.share.public.unshareOne": "Unshare",
    "profile.share.public.unshareAll": "Unshare all my articles",
    "profile.share.public.unshareAllConfirm":
      "Stop sharing every article publicly?",
    "profile.share.public.unshareAllSuccess": "Unshared {count} article(s).",
    "profile.share.invited.title": "People you've invited",
    "profile.share.invited.empty": "You haven't invited anyone yet.",
    "profile.share.invited.activeHeading": "Active access",
    "profile.share.invited.pendingHeading": "Pending invites",
    "profile.share.invited.onlyPowerUsersNote":
      "Inventory invites can only go to existing Power Users. They must accept before getting access.",
    "shareForm.email.note": "Invitee must already be a Power User to accept.",

    "common.retry": "Retry",
    "common.tryAgain": "Try again",

    "articles.bulk.selectionLabel": "Bulk selection actions",
    "articles.bulk.selected": "{count} selected",
    "articles.bulk.share": "Share publicly",
    "articles.bulk.shareTooltip":
      "Make every selected article visible to all Power Users",
    "articles.bulk.unshare": "Unshare",
    "articles.bulk.delete": "Delete selected",
    "articles.bulk.deleteConfirm":
      "Delete {count} article(s)? This cannot be undone.",
    "articles.bulk.deleteSuccess": "Deleted {count} article(s).",
    "articles.bulk.shareSuccess": "Updated sharing on {count} article(s).",
    "articles.bulk.clear": "Clear selection",
    "articles.bulk.selectAll": "Select all on page",

    "export.title": "Export your data",
    "export.subtitle":
      "Download your inventory in CSV (spreadsheet-friendly) or JSON.",
    "export.target.articles": "Articles",
    "export.target.warranties": "Warranties",
    "export.target.attachments": "Attachments",
    "export.success": "Exported {target} as {format}.",

    "nav.locations": "Locations",
    "locations.title": "Locations",
    "locations.subtitle":
      "Create, rename, or delete the places your articles live.",
    "locations.createTitle": "Create a location",
    "locations.allTitle": "All locations",
    "locations.placeholder.name": "Name (e.g. Garage, Office)",
    "locations.placeholder.description": "Description (optional)",
    "locations.create": "Create location",
    "locations.none": "No locations yet.",
    "locations.articleCount": "{count} article(s)",
    "locations.deleteConfirm":
      "Delete this location? Articles will lose this assignment.",
    "locations.created": "Location created.",
    "locations.updated": "Location updated.",
    "locations.deleted": "Location deleted.",

    "articles.table.shared": "Shared",
    "articles.share.unshare": "Unshare",
    "articles.share.state.public":
      "Article is now shared with all Power Users.",
    "articles.share.state.unshared": "Article is no longer publicly shared.",
    "articles.share.state.publicLabel": "Public",
    "articles.share.state.publicTooltip":
      "Every Power User can read this article.",

    "mySharedArticles.title": "Articles I'm sharing publicly",
    "mySharedArticles.subtitle":
      "Every Power User can read these articles. Toggle one off below or from the Articles list.",
    "mySharedArticles.empty":
      "You aren't sharing any articles publicly yet. Open an article from the Articles page and press Share to make it visible to every Power User.",

    "profile.share.invited.scopeNote":
      "These people have READ or WRITE access to your entire inventory — every article, not just one.",

    "admin.db.title": "Database backup & restore",
    "admin.db.subtitle":
      "Export every row of every table as a single JSON file, or import a previous dump to migrate this site to a different database provider.",
    "admin.db.exportButton": "Export full database",
    "admin.db.exporting": "Exporting…",
    "admin.db.exportSuccess": "Database export downloaded.",
    "admin.db.chooseFile": "Import full database…",
    "admin.db.importing": "Importing — do not close this tab…",
    "admin.db.importSuccess":
      "Import succeeded. Signing you out — log back in with the imported credentials.",
    "admin.db.confirmTitle": "This will replace every row in the database.",
    "admin.db.confirmBody":
      "About to import {file}. The current Users, Articles, Warranties, Attachments, Locations, Alerts, Shares, Invites, Audit logs and Stripe-event records will be PERMANENTLY DELETED and replaced with the contents of the file. This action cannot be undone.",
    "admin.db.confirmReplace": "Yes, replace the database",
    "admin.db.invalidJson": "That file is not valid JSON.",
    "admin.db.uploadsNote":
      "Note: files uploaded to /uploads/ are stored on disk, not in the database. Copy that directory separately when migrating providers.",

    "articles.search.placeholder": "Search by name or model…",
    "articles.export.csv": "Export CSV",
    "articles.table.expiresIn": "Expires in",
    "articles.warranty.daysLeft": "days",
  },
  fr: {
    "articles.table.image": "Image",

    "shared.editing.note":
      "Modification au nom du propriétaire. La garantie et les emplacements ne sont pas modifiables ici.",
    "shared.permission.read.tooltip":
      "Lecture seule. Seul le propriétaire peut modifier cet article.",
    "shared.permission.write.tooltip":
      "Le propriétaire vous a accordé un accès en écriture ; vos modifications sont enregistrées dans son inventaire.",
    "shared.source.user": "Direct",
    "shared.source.user.tooltip":
      "Partagé spécifiquement avec vous par le propriétaire.",
    "shared.source.global": "Public",
    "shared.source.global.tooltip":
      "Le propriétaire a rendu cet article visible à tous les Power Users.",

    "acceptInvite.title": "Vous avez une invitation ?",
    "acceptInvite.subtitle":
      "Collez un jeton d'invitation pour accéder à l'inventaire de quelqu'un d'autre.",
    "acceptInvite.placeholder": "Collez le jeton ici…",
    "acceptInvite.submit": "Accepter l'invitation",
    "acceptInvite.success":
      "Invitation acceptée. Vous avez maintenant un accès {permission}.",
    "acceptInvite.error.tokenRequired": "Le jeton est requis.",
    "acceptInvite.error.default": "Impossible d'accepter cette invitation.",

    "theme.cyber": "Cyber",

    "profile.share.public.title": "Articles partagés publiquement",
    "profile.share.public.subtitle":
      "Visibles en lecture seule par tous les Power Users. Vous pouvez les retirer un par un ou tous d'un coup.",
    "profile.share.public.empty":
      "Vous n'avez partagé aucun article publiquement.",
    "profile.share.public.unshareOne": "Retirer",
    "profile.share.public.unshareAll": "Tout retirer du partage public",
    "profile.share.public.unshareAllConfirm":
      "Arrêter de partager tous les articles publiquement ?",
    "profile.share.public.unshareAllSuccess":
      "{count} article(s) retiré(s) du partage.",
    "profile.share.invited.title": "Personnes que vous avez invitées",
    "profile.share.invited.empty": "Vous n'avez encore invité personne.",
    "profile.share.invited.activeHeading": "Accès actifs",
    "profile.share.invited.pendingHeading": "Invitations en attente",
    "profile.share.invited.onlyPowerUsersNote":
      "Les invitations d'inventaire ne peuvent aller qu'à des Power Users existants. Ils doivent les accepter avant d'avoir accès.",
    "shareForm.email.note": "L'invité doit déjà être Power User pour accepter.",

    "common.retry": "Réessayer",
    "common.tryAgain": "Réessayer",

    "articles.bulk.selectionLabel": "Actions sur la sélection",
    "articles.bulk.selected": "{count} sélectionné(s)",
    "articles.bulk.share": "Partager publiquement",
    "articles.bulk.shareTooltip":
      "Rendre tous les articles sélectionnés visibles aux Power Users",
    "articles.bulk.unshare": "Retirer du partage",
    "articles.bulk.delete": "Supprimer la sélection",
    "articles.bulk.deleteConfirm":
      "Supprimer {count} article(s) ? Cette action est irréversible.",
    "articles.bulk.deleteSuccess": "{count} article(s) supprimé(s).",
    "articles.bulk.shareSuccess": "Partage mis à jour sur {count} article(s).",
    "articles.bulk.clear": "Effacer la sélection",
    "articles.bulk.selectAll": "Tout sélectionner sur cette page",

    "export.title": "Exporter vos données",
    "export.subtitle":
      "Téléchargez votre inventaire en CSV (compatible tableur) ou JSON.",
    "export.target.articles": "Articles",
    "export.target.warranties": "Garanties",
    "export.target.attachments": "Pièces jointes",
    "export.success": "{target} exportés en {format}.",

    "nav.locations": "Lieux",
    "locations.title": "Lieux",
    "locations.subtitle":
      "Créez, renommez ou supprimez les endroits où vivent vos articles.",
    "locations.createTitle": "Créer un lieu",
    "locations.allTitle": "Tous les lieux",
    "locations.placeholder.name": "Nom (ex. Garage, Bureau)",
    "locations.placeholder.description": "Description (optionnel)",
    "locations.create": "Créer le lieu",
    "locations.none": "Aucun lieu pour le moment.",
    "locations.articleCount": "{count} article(s)",
    "locations.deleteConfirm":
      "Supprimer ce lieu ? Les articles perdront cette assignation.",
    "locations.created": "Lieu créé.",
    "locations.updated": "Lieu mis à jour.",
    "locations.deleted": "Lieu supprimé.",

    "articles.table.shared": "Partagé",
    "articles.share.unshare": "Retirer du partage",
    "articles.share.state.public":
      "L'article est maintenant partagé avec tous les Power Users.",
    "articles.share.state.unshared":
      "L'article n'est plus partagé publiquement.",
    "articles.share.state.publicLabel": "Public",
    "articles.share.state.publicTooltip":
      "Tous les Power Users peuvent lire cet article.",

    "mySharedArticles.title": "Articles que je partage publiquement",
    "mySharedArticles.subtitle":
      "Tous les Power Users peuvent lire ces articles. Désactivez l'un d'eux ci-dessous ou depuis la liste des articles.",
    "mySharedArticles.empty":
      "Vous ne partagez aucun article publiquement. Ouvrez un article depuis la page Articles et cliquez sur Partager pour le rendre visible à tous les Power Users.",

    "profile.share.invited.scopeNote":
      "Ces personnes ont un accès LECTURE ou ÉCRITURE à tout votre inventaire — chaque article, pas juste un.",

    "admin.db.title": "Sauvegarde et restauration de la base",
    "admin.db.subtitle":
      "Exportez chaque ligne de chaque table dans un fichier JSON unique, ou importez un export précédent pour migrer ce site vers un autre fournisseur de base de données.",
    "admin.db.exportButton": "Exporter la base complète",
    "admin.db.exporting": "Export en cours…",
    "admin.db.exportSuccess": "Export téléchargé.",
    "admin.db.chooseFile": "Importer la base complète…",
    "admin.db.importing": "Import en cours — ne fermez pas cet onglet…",
    "admin.db.importSuccess":
      "Import réussi. Déconnexion en cours — reconnectez-vous avec les identifiants importés.",
    "admin.db.confirmTitle":
      "Cette action va remplacer chaque ligne de la base.",
    "admin.db.confirmBody":
      "Sur le point d'importer {file}. Les Utilisateurs, Articles, Garanties, Pièces jointes, Emplacements, Alertes, Partages, Invitations, Journaux d'audit et événements Stripe actuels seront DÉFINITIVEMENT SUPPRIMÉS et remplacés par le contenu du fichier. Cette action est irréversible.",
    "admin.db.confirmReplace": "Oui, remplacer la base",
    "admin.db.invalidJson": "Ce fichier n'est pas un JSON valide.",
    "admin.db.uploadsNote":
      "Remarque : les fichiers téléversés dans /uploads/ sont stockés sur le disque, pas en base. Copiez ce dossier séparément lors d'une migration.",

    "articles.search.placeholder": "Rechercher par nom ou modèle…",
    "articles.export.csv": "Exporter CSV",
    "articles.table.expiresIn": "Expire dans",
    "articles.warranty.daysLeft": "jours",
  },
  pt: {
    "articles.table.image": "Imagem",

    "shared.editing.note":
      "A editar em nome do proprietário. A garantia e as localizações não são editáveis aqui.",
    "shared.permission.read.tooltip":
      "Apenas leitura. Só o proprietário pode editar este artigo.",
    "shared.permission.write.tooltip":
      "O proprietário deu-lhe acesso de escrita; as suas edições são guardadas no inventário dele.",
    "shared.source.user": "Direto",
    "shared.source.user.tooltip":
      "Partilhado especificamente consigo pelo proprietário.",
    "shared.source.global": "Público",
    "shared.source.global.tooltip":
      "O proprietário tornou este artigo visível a todos os Power Users.",

    "acceptInvite.title": "Tem um convite?",
    "acceptInvite.subtitle":
      "Cole um token de convite para aceder ao inventário de outra pessoa.",
    "acceptInvite.placeholder": "Cole o token aqui…",
    "acceptInvite.submit": "Aceitar convite",
    "acceptInvite.success": "Convite aceite. Tem agora acesso {permission}.",
    "acceptInvite.error.tokenRequired": "O token é obrigatório.",
    "acceptInvite.error.default": "Não foi possível aceitar este convite.",

    "theme.cyber": "Cyber",

    "profile.share.public.title": "Artigos partilhados publicamente",
    "profile.share.public.subtitle":
      "Visíveis em apenas leitura por todos os Power Users. Pode cancelar individualmente ou todos de uma vez.",
    "profile.share.public.empty": "Não partilhou nenhum artigo publicamente.",
    "profile.share.public.unshareOne": "Cancelar partilha",
    "profile.share.public.unshareAll": "Cancelar partilha de tudo",
    "profile.share.public.unshareAllConfirm":
      "Cancelar a partilha pública de todos os artigos?",
    "profile.share.public.unshareAllSuccess":
      "Partilha cancelada para {count} artigo(s).",
    "profile.share.invited.title": "Pessoas que convidou",
    "profile.share.invited.empty": "Ainda não convidou ninguém.",
    "profile.share.invited.activeHeading": "Acessos ativos",
    "profile.share.invited.pendingHeading": "Convites pendentes",
    "profile.share.invited.onlyPowerUsersNote":
      "Os convites de inventário só podem ser enviados a Power Users existentes. Têm de aceitar antes de obter acesso.",
    "shareForm.email.note": "O convidado tem de ser Power User para aceitar.",

    "common.retry": "Tentar novamente",
    "common.tryAgain": "Tentar novamente",

    "articles.bulk.selectionLabel": "Ações na seleção",
    "articles.bulk.selected": "{count} selecionado(s)",
    "articles.bulk.share": "Partilhar publicamente",
    "articles.bulk.shareTooltip":
      "Tornar todos os artigos selecionados visíveis para os Power Users",
    "articles.bulk.unshare": "Cancelar partilha",
    "articles.bulk.delete": "Eliminar seleção",
    "articles.bulk.deleteConfirm":
      "Eliminar {count} artigo(s)? Esta ação é irreversível.",
    "articles.bulk.deleteSuccess": "{count} artigo(s) eliminado(s).",
    "articles.bulk.shareSuccess": "Partilha atualizada em {count} artigo(s).",
    "articles.bulk.clear": "Limpar seleção",
    "articles.bulk.selectAll": "Selecionar tudo nesta página",

    "export.title": "Exportar os seus dados",
    "export.subtitle":
      "Descarregue o seu inventário em CSV (compatível com folha de cálculo) ou JSON.",
    "export.target.articles": "Artigos",
    "export.target.warranties": "Garantias",
    "export.target.attachments": "Anexos",
    "export.success": "{target} exportados em {format}.",

    "nav.locations": "Locais",
    "locations.title": "Locais",
    "locations.subtitle":
      "Crie, renomeie ou elimine os locais onde os seus artigos estão.",
    "locations.createTitle": "Criar um local",
    "locations.allTitle": "Todos os locais",
    "locations.placeholder.name": "Nome (ex. Garagem, Escritório)",
    "locations.placeholder.description": "Descrição (opcional)",
    "locations.create": "Criar local",
    "locations.none": "Ainda não há locais.",
    "locations.articleCount": "{count} artigo(s)",
    "locations.deleteConfirm":
      "Eliminar este local? Os artigos vão perder esta atribuição.",
    "locations.created": "Local criado.",
    "locations.updated": "Local atualizado.",
    "locations.deleted": "Local eliminado.",

    "articles.table.shared": "Partilhado",
    "articles.share.unshare": "Cancelar partilha",
    "articles.share.state.public":
      "O artigo está agora partilhado com todos os Power Users.",
    "articles.share.state.unshared":
      "O artigo já não está partilhado publicamente.",
    "articles.share.state.publicLabel": "Público",
    "articles.share.state.publicTooltip":
      "Todos os Power Users podem ler este artigo.",

    "mySharedArticles.title": "Artigos que estou a partilhar publicamente",
    "mySharedArticles.subtitle":
      "Todos os Power Users podem ler estes artigos. Cancele a partilha de um abaixo ou na lista de Artigos.",
    "mySharedArticles.empty":
      "Ainda não está a partilhar nenhum artigo publicamente. Abra um artigo na página Artigos e carregue em Partilhar para o tornar visível a todos os Power Users.",

    "profile.share.invited.scopeNote":
      "Estas pessoas têm acesso de LEITURA ou ESCRITA a todo o seu inventário — cada artigo, não apenas um.",

    "admin.db.title": "Cópia de segurança e restauro da base",
    "admin.db.subtitle":
      "Exporta todas as linhas de todas as tabelas para um único ficheiro JSON, ou importa uma cópia anterior para migrar este site para outro fornecedor de base de dados.",
    "admin.db.exportButton": "Exportar base completa",
    "admin.db.exporting": "A exportar…",
    "admin.db.exportSuccess": "Exportação descarregada.",
    "admin.db.chooseFile": "Importar base completa…",
    "admin.db.importing": "A importar — não feche este separador…",
    "admin.db.importSuccess":
      "Importação concluída. A terminar a sua sessão — inicie sessão novamente com as credenciais importadas.",
    "admin.db.confirmTitle":
      "Esta ação vai substituir todas as linhas da base de dados.",
    "admin.db.confirmBody":
      "Prestes a importar {file}. Os Utilizadores, Artigos, Garantias, Anexos, Localizações, Alertas, Partilhas, Convites, Registos de auditoria e eventos Stripe atuais serão PERMANENTEMENTE ELIMINADOS e substituídos pelo conteúdo do ficheiro. Esta ação não pode ser revertida.",
    "admin.db.confirmReplace": "Sim, substituir a base",
    "admin.db.invalidJson": "Esse ficheiro não é JSON válido.",
    "admin.db.uploadsNote":
      "Nota: os ficheiros enviados para /uploads/ são guardados em disco, não na base. Copie esse diretório à parte ao migrar de fornecedor.",

    "articles.search.placeholder": "Pesquisar por nome ou modelo…",
    "articles.export.csv": "Exportar CSV",
    "articles.table.expiresIn": "Expira em",
    "articles.warranty.daysLeft": "dias",
  },
} as const;

export type ExtrasKey = keyof (typeof extras)["en"];
