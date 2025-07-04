import React, { useState, useEffect } from "react";
import { InventoryShare, User } from "../../types";
import { apiClient } from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";

export function SharingManagement() {
  const { user: currentUser } = useAuth();
  const [shares, setShares] = useState<InventoryShare[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    accessLevel: "READ" as "READ" | "WRITE",
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [sharesData, usersData] = await Promise.all([
        apiClient.getShares(),
        apiClient.getUsers(),
      ]);
      setShares(sharesData);
      setUsers(usersData);
      setError("");
    } catch (err: any) {
      setError(err.error || "Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const targetUser = users.find((u) => u.email === formData.email);
      if (!targetUser) {
        setError("Utilisateur non trouvé");
        return;
      }

      await apiClient.createShare({
        sharedWithUserId: targetUser.userId,
        accessLevel: formData.accessLevel,
      });

      setFormData({ email: "", accessLevel: "READ" });
      setShowForm(false);
      loadData(); // Reload data
    } catch (err: any) {
      setError(err.error || "Erreur lors de la création du partage");
    }
  };

  const handleDeleteShare = async (shareId: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce partage ?")) {
      return;
    }

    try {
      await apiClient.deleteShare(shareId);
      setShares(shares.filter((s) => s.shareId !== shareId));
    } catch (err: any) {
      setError(err.error || "Erreur lors de la suppression");
    }
  };

  const getAccessLevelLabel = (level: string) => {
    switch (level) {
      case "READ":
        return { label: "Lecture seule", color: "bg-blue-100 text-blue-800" };
      case "WRITE":
        return {
          label: "Lecture et écriture",
          color: "bg-green-100 text-green-800",
        };
      default:
        return { label: level, color: "bg-gray-100 text-gray-800" };
    }
  };

  if (!currentUser || !["POWER_USER", "ADMIN"].includes(currentUser.role)) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Accès refusé
          </h2>
          <p className="text-gray-600">
            Vous n'avez pas les permissions nécessaires pour gérer le partage
            d'inventaire.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="sm:flex sm:items-center">
        <div className="sm:flex-auto">
          <h1 className="text-2xl font-semibold text-gray-900">
            Partage d'inventaire
          </h1>
          <p className="mt-2 text-sm text-gray-700">
            Gérez qui peut accéder à votre inventaire et avec quels droits.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
          >
            Partager avec un utilisateur
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Share form */}
      {showForm && (
        <div className="mt-6 bg-gray-50 p-4 rounded-lg">
          <form onSubmit={handleCreateShare} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700"
              >
                Email de l'utilisateur
              </label>
              <input
                type="email"
                id="email"
                required
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="utilisateur@exemple.com"
              />
            </div>

            <div>
              <label
                htmlFor="accessLevel"
                className="block text-sm font-medium text-gray-700"
              >
                Niveau d'accès
              </label>
              <select
                id="accessLevel"
                value={formData.accessLevel}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    accessLevel: e.target.value as "READ" | "WRITE",
                  })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="READ">Lecture seule</option>
                <option value="WRITE">Lecture et écriture</option>
              </select>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700"
              >
                Créer le partage
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Shares list */}
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            {shares.length === 0 ? (
              <div className="text-center py-12">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  Aucun partage
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Commencez par partager votre inventaire avec d'autres
                  utilisateurs.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Utilisateur
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Niveau d'accès
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        Date de création
                      </th>
                      <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {shares.map((share) => {
                      const sharedUser = users.find(
                        (u) => u.userId === share.sharedWithUserId,
                      );
                      const accessLevel = getAccessLevelLabel(
                        share.accessLevel,
                      );

                      return (
                        <tr key={share.shareId} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-gray-900">
                              {sharedUser?.email || "Utilisateur inconnu"}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${accessLevel.color}`}
                            >
                              {accessLevel.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(share.createdAt).toLocaleDateString(
                              "fr-FR",
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <button
                              onClick={() => handleDeleteShare(share.shareId)}
                              className="text-red-600 hover:text-red-900"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
