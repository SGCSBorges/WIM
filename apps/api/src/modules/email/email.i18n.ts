/**
 * Server-side copy for outbound email + push, in the five languages the web
 * client speaks. `User.language` (validated to en/fr/pt/es/nl on write) picks
 * the dictionary; anything else — unset, legacy, a full BCP-47 tag — falls
 * back to English by its first two letters. Every key must exist in every
 * language (a test enforces parity), and `{name}`-style placeholders are
 * substituted once, so a value containing braces can't re-expand.
 *
 * Kept deliberately tiny: a flat map + one interpolator. The web client's
 * dictionaries are separate on purpose — email copy is complete sentences
 * with different tone and lifetime, and sharing keys would couple every
 * template to a UI string that may be reworded for a button.
 */
export const EMAIL_LANGS = ["en", "fr", "pt", "es", "nl"] as const;
export type EmailLang = (typeof EMAIL_LANGS)[number];

export function normalizeEmailLang(raw: string | null | undefined): EmailLang {
  const two = (raw ?? "").trim().toLowerCase().slice(0, 2);
  return (EMAIL_LANGS as readonly string[]).includes(two)
    ? (two as EmailLang)
    : "en";
}

const en = {
  openInApp: "Open in WIM",
  powerUser: "A Power User",
  "warranty.reminder.subject": "Warranty reminder: {name}",
  "warranty.reminder.push": "Warranty expires {date}.",
  "warranty.reminder.body": 'Warranty "{name}" expires {date}.',
  "custom.defaultBody": "Maintenance reminder.",
  "digest.subject": "Warranty digest — {count} expiring soon",
  "digest.body":
    "You have {count} warranty(ies) expiring in the next {days} days:\n\n{lines}",
  "digest.line": "• {article} — {warranty} — expires {date}",
  "digest.articleGone": "(article gone)",
  "passwordReset.subject": "Reset your WIM password",
  "passwordReset.body":
    "Someone (hopefully you) requested a password reset. Click the link below within 30 minutes to set a new password. If you didn't ask for this, ignore this message — your account is unchanged.",
  "verifyEmail.subject": "Verify your WIM email address",
  "verifyEmail.body":
    "Confirm this is your email address by clicking the link below. This keeps transfer and sharing notifications deliverable to you. The link is valid for 3 days.",
  "found.subject": 'WIM: someone found "{name}"',
  "found.body":
    'A finder left a message about your lost item "{name}":\n\n{message}',
  "found.contact": "Contact: {contact}",
  "transfer.article": "Article",
  "transfer.anArticle": "an article",
  "transfer.yourArticle": "your article",
  "transfer.push.subject": "WIM: Article transfer request — {name}",
  "transfer.push.body":
    "Someone has offered to transfer an article to your WIM inventory.\n\nArticle: {name}\n\nUse token: {token}\n\nThis offer expires in 7 days.",
  "transfer.pull.subject": 'WIM: Transfer request for "{name}"',
  "transfer.pull.body":
    "{requester} has requested to take ownership of your article.\n\nArticle: {name}\n\nUse token: {token} to accept or reject from your WIM app.\n\nThis request expires in 7 days.",
  "household.invite.subject":
    'WIM: you\'ve been invited to the "{name}" household',
  "household.invite.body":
    "A WIM Power User invited you to join their household — you'll see and manage each other's inventories. Open the link below to accept. The invite expires in 7 days.",
  "message.new.subject": 'WIM: New message about "{name}"',
  "message.new.body":
    '{sender} sent you a message about your shared item "{name}":\n\n"{preview}"\n\nOpen WIM to reply.',
  "message.reply.body":
    '{sender} replied about "{name}":\n\n"{preview}"\n\nOpen WIM to continue the conversation.',
  "offer.subject": 'WIM: New offer on "{name}"',
  "offer.body":
    '{sender} offered {amount} for your item "{name}".\n\nOpen WIM to accept or decline.',
  "offerAccepted.subject": 'WIM: Offer accepted on "{name}"',
  "offerAccepted.body":
    'Your offer on "{name}" was accepted. Complete the transfer to your inventory.\n\nUse token: {token}\n\nThis transfer expires in 7 days.',
};

export type EmailKey = keyof typeof en;
type Dict = Record<EmailKey, string>;

const fr: Dict = {
  openInApp: "Ouvrir dans WIM",
  powerUser: "Un Power User",
  "warranty.reminder.subject": "Rappel de garantie : {name}",
  "warranty.reminder.push": "La garantie expire le {date}.",
  "warranty.reminder.body": "La garantie « {name} » expire le {date}.",
  "custom.defaultBody": "Rappel d'entretien.",
  "digest.subject": "Récapitulatif des garanties — {count} expirent bientôt",
  "digest.body":
    "Vous avez {count} garantie(s) qui expire(nt) dans les {days} prochains jours :\n\n{lines}",
  "digest.line": "• {article} — {warranty} — expire le {date}",
  "digest.articleGone": "(article supprimé)",
  "passwordReset.subject": "Réinitialisez votre mot de passe WIM",
  "passwordReset.body":
    "Quelqu'un (vous, espérons-le) a demandé la réinitialisation du mot de passe. Cliquez sur le lien ci-dessous dans les 30 minutes pour définir un nouveau mot de passe. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message — votre compte reste inchangé.",
  "verifyEmail.subject": "Vérifiez votre adresse e-mail WIM",
  "verifyEmail.body":
    "Confirmez qu'il s'agit bien de votre adresse e-mail en cliquant sur le lien ci-dessous. Cela garantit que les notifications de transfert et de partage vous parviennent. Le lien est valable 3 jours.",
  "found.subject": "WIM : quelqu'un a trouvé « {name} »",
  "found.body":
    "Une personne a laissé un message au sujet de votre objet perdu « {name} » :\n\n{message}",
  "found.contact": "Contact : {contact}",
  "transfer.article": "Article",
  "transfer.anArticle": "un article",
  "transfer.yourArticle": "votre article",
  "transfer.push.subject": "WIM : demande de transfert d'article — {name}",
  "transfer.push.body":
    "Quelqu'un vous propose de transférer un article vers votre inventaire WIM.\n\nArticle : {name}\n\nJeton à utiliser : {token}\n\nCette offre expire dans 7 jours.",
  "transfer.pull.subject": "WIM : demande de transfert pour « {name} »",
  "transfer.pull.body":
    "{requester} demande à devenir propriétaire de votre article.\n\nArticle : {name}\n\nUtilisez le jeton : {token} pour accepter ou refuser depuis votre application WIM.\n\nCette demande expire dans 7 jours.",
  "household.invite.subject":
    "WIM : vous êtes invité(e) à rejoindre le foyer « {name} »",
  "household.invite.body":
    "Un Power User WIM vous invite à rejoindre son foyer — vous verrez et gérerez mutuellement vos inventaires. Ouvrez le lien ci-dessous pour accepter. L'invitation expire dans 7 jours.",
  "message.new.subject": "WIM : nouveau message concernant « {name} »",
  "message.new.body":
    "{sender} vous a envoyé un message au sujet de votre objet partagé « {name} » :\n\n« {preview} »\n\nOuvrez WIM pour répondre.",
  "message.reply.body":
    "{sender} a répondu au sujet de « {name} » :\n\n« {preview} »\n\nOuvrez WIM pour poursuivre la conversation.",
  "offer.subject": "WIM : nouvelle offre pour « {name} »",
  "offer.body":
    "{sender} propose {amount} pour votre objet « {name} ».\n\nOuvrez WIM pour accepter ou refuser.",
  "offerAccepted.subject": "WIM : offre acceptée pour « {name} »",
  "offerAccepted.body":
    "Votre offre pour « {name} » a été acceptée. Finalisez le transfert vers votre inventaire.\n\nJeton à utiliser : {token}\n\nCe transfert expire dans 7 jours.",
};

const pt: Dict = {
  openInApp: "Abrir no WIM",
  powerUser: "Um Power User",
  "warranty.reminder.subject": "Lembrete de garantia: {name}",
  "warranty.reminder.push": "A garantia expira em {date}.",
  "warranty.reminder.body": 'A garantia "{name}" expira em {date}.',
  "custom.defaultBody": "Lembrete de manutenção.",
  "digest.subject": "Resumo de garantias — {count} a expirar em breve",
  "digest.body":
    "Tem {count} garantia(s) a expirar nos próximos {days} dias:\n\n{lines}",
  "digest.line": "• {article} — {warranty} — expira em {date}",
  "digest.articleGone": "(artigo removido)",
  "passwordReset.subject": "Redefina a sua palavra-passe WIM",
  "passwordReset.body":
    "Alguém (esperamos que você) pediu a redefinição da palavra-passe. Clique na ligação abaixo dentro de 30 minutos para definir uma nova palavra-passe. Se não fez este pedido, ignore esta mensagem — a sua conta permanece inalterada.",
  "verifyEmail.subject": "Confirme o seu endereço de e-mail WIM",
  "verifyEmail.body":
    "Confirme que este é o seu endereço de e-mail clicando na ligação abaixo. Assim as notificações de transferência e partilha continuam a chegar-lhe. A ligação é válida por 3 dias.",
  "found.subject": 'WIM: alguém encontrou "{name}"',
  "found.body":
    'Alguém deixou uma mensagem sobre o seu item perdido "{name}":\n\n{message}',
  "found.contact": "Contacto: {contact}",
  "transfer.article": "Artigo",
  "transfer.anArticle": "um artigo",
  "transfer.yourArticle": "o seu artigo",
  "transfer.push.subject": "WIM: pedido de transferência de artigo — {name}",
  "transfer.push.body":
    "Alguém ofereceu transferir um artigo para o seu inventário WIM.\n\nArtigo: {name}\n\nUse o token: {token}\n\nEsta oferta expira em 7 dias.",
  "transfer.pull.subject": 'WIM: pedido de transferência de "{name}"',
  "transfer.pull.body":
    "{requester} pediu para ficar com a propriedade do seu artigo.\n\nArtigo: {name}\n\nUse o token: {token} para aceitar ou recusar na sua aplicação WIM.\n\nEste pedido expira em 7 dias.",
  "household.invite.subject": 'WIM: foi convidado(a) para o agregado "{name}"',
  "household.invite.body":
    "Um Power User do WIM convidou-o(a) para o seu agregado — verão e gerirão os inventários um do outro. Abra a ligação abaixo para aceitar. O convite expira em 7 dias.",
  "message.new.subject": 'WIM: nova mensagem sobre "{name}"',
  "message.new.body":
    '{sender} enviou-lhe uma mensagem sobre o seu item partilhado "{name}":\n\n"{preview}"\n\nAbra o WIM para responder.',
  "message.reply.body":
    '{sender} respondeu sobre "{name}":\n\n"{preview}"\n\nAbra o WIM para continuar a conversa.',
  "offer.subject": 'WIM: nova oferta por "{name}"',
  "offer.body":
    '{sender} ofereceu {amount} pelo seu item "{name}".\n\nAbra o WIM para aceitar ou recusar.',
  "offerAccepted.subject": 'WIM: oferta aceite por "{name}"',
  "offerAccepted.body":
    'A sua oferta por "{name}" foi aceite. Conclua a transferência para o seu inventário.\n\nUse o token: {token}\n\nEsta transferência expira em 7 dias.',
};

const es: Dict = {
  openInApp: "Abrir en WIM",
  powerUser: "Un Power User",
  "warranty.reminder.subject": "Recordatorio de garantía: {name}",
  "warranty.reminder.push": "La garantía vence el {date}.",
  "warranty.reminder.body": 'La garantía "{name}" vence el {date}.',
  "custom.defaultBody": "Recordatorio de mantenimiento.",
  "digest.subject": "Resumen de garantías — {count} vencen pronto",
  "digest.body":
    "Tiene {count} garantía(s) que vencen en los próximos {days} días:\n\n{lines}",
  "digest.line": "• {article} — {warranty} — vence el {date}",
  "digest.articleGone": "(artículo eliminado)",
  "passwordReset.subject": "Restablezca su contraseña de WIM",
  "passwordReset.body":
    "Alguien (esperamos que usted) solicitó restablecer la contraseña. Haga clic en el enlace de abajo en un plazo de 30 minutos para definir una nueva contraseña. Si no lo solicitó, ignore este mensaje: su cuenta no ha cambiado.",
  "verifyEmail.subject": "Verifique su dirección de correo de WIM",
  "verifyEmail.body":
    "Confirme que esta es su dirección de correo haciendo clic en el enlace de abajo. Así las notificaciones de transferencia y de compartición le seguirán llegando. El enlace es válido durante 3 días.",
  "found.subject": 'WIM: alguien encontró "{name}"',
  "found.body":
    'Alguien dejó un mensaje sobre su objeto perdido "{name}":\n\n{message}',
  "found.contact": "Contacto: {contact}",
  "transfer.article": "Artículo",
  "transfer.anArticle": "un artículo",
  "transfer.yourArticle": "su artículo",
  "transfer.push.subject":
    "WIM: solicitud de transferencia de artículo — {name}",
  "transfer.push.body":
    "Alguien ha ofrecido transferir un artículo a su inventario de WIM.\n\nArtículo: {name}\n\nUse el token: {token}\n\nEsta oferta vence en 7 días.",
  "transfer.pull.subject": 'WIM: solicitud de transferencia de "{name}"',
  "transfer.pull.body":
    "{requester} ha solicitado quedarse con la propiedad de su artículo.\n\nArtículo: {name}\n\nUse el token: {token} para aceptar o rechazar desde su aplicación WIM.\n\nEsta solicitud vence en 7 días.",
  "household.invite.subject": 'WIM: le han invitado al hogar "{name}"',
  "household.invite.body":
    "Un Power User de WIM le ha invitado a su hogar: verán y gestionarán los inventarios del otro. Abra el enlace de abajo para aceptar. La invitación vence en 7 días.",
  "message.new.subject": 'WIM: nuevo mensaje sobre "{name}"',
  "message.new.body":
    '{sender} le envió un mensaje sobre su artículo compartido "{name}":\n\n"{preview}"\n\nAbra WIM para responder.',
  "message.reply.body":
    '{sender} respondió sobre "{name}":\n\n"{preview}"\n\nAbra WIM para continuar la conversación.',
  "offer.subject": 'WIM: nueva oferta por "{name}"',
  "offer.body":
    '{sender} ofreció {amount} por su artículo "{name}".\n\nAbra WIM para aceptar o rechazar.',
  "offerAccepted.subject": 'WIM: oferta aceptada por "{name}"',
  "offerAccepted.body":
    'Su oferta por "{name}" fue aceptada. Complete la transferencia a su inventario.\n\nUse el token: {token}\n\nEsta transferencia vence en 7 días.',
};

const nl: Dict = {
  openInApp: "Openen in WIM",
  powerUser: "Een Power User",
  "warranty.reminder.subject": "Garantieherinnering: {name}",
  "warranty.reminder.push": "De garantie verloopt op {date}.",
  "warranty.reminder.body": 'De garantie "{name}" verloopt op {date}.',
  "custom.defaultBody": "Onderhoudsherinnering.",
  "digest.subject": "Garantieoverzicht — {count} verlopen binnenkort",
  "digest.body":
    "U heeft {count} garantie(s) die in de komende {days} dagen verlopen:\n\n{lines}",
  "digest.line": "• {article} — {warranty} — verloopt op {date}",
  "digest.articleGone": "(artikel verwijderd)",
  "passwordReset.subject": "Stel uw WIM-wachtwoord opnieuw in",
  "passwordReset.body":
    "Iemand (hopelijk uzelf) heeft gevraagd het wachtwoord opnieuw in te stellen. Klik binnen 30 minuten op de onderstaande link om een nieuw wachtwoord in te stellen. Heeft u dit niet aangevraagd, negeer dan dit bericht — uw account is ongewijzigd.",
  "verifyEmail.subject": "Bevestig uw WIM-e-mailadres",
  "verifyEmail.body":
    "Bevestig dat dit uw e-mailadres is door op de onderstaande link te klikken. Zo blijven overdracht- en deelmeldingen u bereiken. De link is 3 dagen geldig.",
  "found.subject": 'WIM: iemand heeft "{name}" gevonden',
  "found.body":
    'Iemand heeft een bericht achtergelaten over uw verloren voorwerp "{name}":\n\n{message}',
  "found.contact": "Contact: {contact}",
  "transfer.article": "Artikel",
  "transfer.anArticle": "een artikel",
  "transfer.yourArticle": "uw artikel",
  "transfer.push.subject": "WIM: verzoek tot overdracht van artikel — {name}",
  "transfer.push.body":
    "Iemand heeft aangeboden een artikel naar uw WIM-inventaris over te dragen.\n\nArtikel: {name}\n\nGebruik token: {token}\n\nDit aanbod verloopt over 7 dagen.",
  "transfer.pull.subject": 'WIM: overdrachtsverzoek voor "{name}"',
  "transfer.pull.body":
    "{requester} heeft gevraagd het eigendom van uw artikel over te nemen.\n\nArtikel: {name}\n\nGebruik token: {token} om te accepteren of te weigeren in uw WIM-app.\n\nDit verzoek verloopt over 7 dagen.",
  "household.invite.subject":
    'WIM: u bent uitgenodigd voor het huishouden "{name}"',
  "household.invite.body":
    "Een WIM Power User heeft u uitgenodigd voor zijn of haar huishouden — u ziet en beheert elkaars inventaris. Open de onderstaande link om te accepteren. De uitnodiging verloopt over 7 dagen.",
  "message.new.subject": 'WIM: nieuw bericht over "{name}"',
  "message.new.body":
    '{sender} heeft u een bericht gestuurd over uw gedeelde item "{name}":\n\n"{preview}"\n\nOpen WIM om te antwoorden.',
  "message.reply.body":
    '{sender} heeft geantwoord over "{name}":\n\n"{preview}"\n\nOpen WIM om het gesprek voort te zetten.',
  "offer.subject": 'WIM: nieuw bod op "{name}"',
  "offer.body":
    '{sender} bood {amount} voor uw item "{name}".\n\nOpen WIM om te accepteren of te weigeren.',
  "offerAccepted.subject": 'WIM: bod op "{name}" geaccepteerd',
  "offerAccepted.body":
    'Uw bod op "{name}" is geaccepteerd. Rond de overdracht naar uw inventaris af.\n\nGebruik token: {token}\n\nDeze overdracht verloopt over 7 dagen.',
};

export const EMAIL_STRINGS: Record<EmailLang, Dict> = { en, fr, pt, es, nl };

type Vars = Record<string, string | number>;

/** One-pass `{placeholder}` substitution; unknown placeholders are left
 *  verbatim so a missing variable is visible in the outbox, not silent. */
export function emailT(lang: EmailLang, key: EmailKey, vars: Vars = {}) {
  const template = EMAIL_STRINGS[lang]?.[key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

export type EmailTranslator = (key: EmailKey, vars?: Vars) => string;

/** Bind a language once per recipient: `const t = emailTranslator(lang)`. */
export function emailTranslator(
  lang: string | null | undefined
): EmailTranslator {
  const l = normalizeEmailLang(lang);
  return (key, vars) => emailT(l, key, vars);
}
