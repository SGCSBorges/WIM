// Simple mock data for demonstration
export const mockArticles = [
  {
    articleId: 1,
    articleNom: "Ordinateur portable",
    articleModele: "Dell Latitude 5520",
    articleDescription: "Ordinateur portable pour développement",
    ownerUserId: 1,
    owner: { userId: 1, email: "demo@example.com" },
  },
  {
    articleId: 2,
    articleNom: "Écran",
    articleModele: "Dell U2720Q",
    articleDescription: "Écran 4K 27 pouces",
    ownerUserId: 1,
    owner: { userId: 1, email: "demo@example.com" },
  },
];

export const mockWarranties = [
  {
    garantieId: 1,
    garantieArticleId: 1,
    garantieNom: "Garantie constructeur",
    garantieDateAchat: new Date("2024-01-15"),
    garantieDuration: 24,
    garantieFin: new Date("2026-01-15"),
    garantieIsValide: true,
    garantieImage: null,
    ownerUserId: 1,
  },
];
