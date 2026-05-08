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
  },
} as const;

export type ExtrasKey = keyof (typeof extras)["en"];
