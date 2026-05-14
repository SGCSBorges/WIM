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
  },
  fr: {
    "articles.table.image": "Image",

    "shared.editing.note":
      "Modification au nom du propriétaire. La garantie et les emplacements ne sont pas modifiables ici.",
    "shared.permission.read.tooltip":
      "Lecture seule. Seul le propriétaire peut modifier cet article.",
    "shared.permission.write.tooltip":
      "Le propriétaire vous a accordé un accès en écriture ; vos modifications sont enregistrées dans son inventaire.",
    "shared.source.user": "Direct",
    "shared.source.user.tooltip":
      "Partagé spécifiquement avec vous par le propriétaire.",
    "shared.source.global": "Public",
    "shared.source.global.tooltip":
      "Le propriétaire a rendu cet article visible à tous les Power Users.",

    "acceptInvite.title": "Vous avez une invitation ?",
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
      "Arrêter de partager tous les articles publiquement ?",
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
      "Supprimer {count} article(s) ? Cette action est irréversible.",
    "articles.bulk.deleteSuccess": "{count} article(s) supprimé(s).",
    "articles.bulk.shareSuccess":
      "Partage mis à jour sur {count} article(s).",
    "articles.bulk.clear": "Effacer la sélection",
    "articles.bulk.selectAll": "Tout sélectionner sur cette page",

    "export.title": "Exporter vos données",
    "export.subtitle":
      "Téléchargez votre inventaire en CSV (compatible tableur) ou JSON.",
    "export.target.articles": "Articles",
    "export.target.warranties": "Garanties",
    "export.target.attachments": "Pièces jointes",
    "export.success": "{target} exportés en {format}.",
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
    "articles.bulk.shareSuccess":
      "Partilha atualizada em {count} artigo(s).",
    "articles.bulk.clear": "Limpar seleção",
    "articles.bulk.selectAll": "Selecionar tudo nesta página",

    "export.title": "Exportar os seus dados",
    "export.subtitle":
      "Descarregue o seu inventário em CSV (compatível com folha de cálculo) ou JSON.",
    "export.target.articles": "Artigos",
    "export.target.warranties": "Garantias",
    "export.target.attachments": "Anexos",
    "export.success": "{target} exportados em {format}.",
  },
} as const;

export type ExtrasKey = keyof (typeof extras)["en"];
