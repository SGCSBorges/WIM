import React, { useState, useEffect } from "react";

interface Warranty {
  garantieId: number;
  garantieNom: string;
  garantieDateAchat: string;
  garantieDuration: number;
  garantieFin: string;
  garantieIsValide: boolean;
  createdAt: string;
  updatedAt: string;
  article: {
    articleId: number;
    articleNom: string;
    articleModele: string;
  };
}

interface WarrantiesListProps {
  onEdit?: (warranty: Warranty) => void;
  onDelete?: (warrantyId: number) => void;
  onAdd?: () => void;
  isLoading?: boolean;
}

const WarrantiesList: React.FC<WarrantiesListProps> = ({
  onEdit,
  onDelete,
  onAdd,
  isLoading = false,
}) => {
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "expiration" | "article">(
    "expiration",
  );
  const [filterStatus, setFilterStatus] = useState<"all" | "valid" | "expired">(
    "all",
  );

  useEffect(() => {
    fetchWarranties();
  }, []);

  const fetchWarranties = async () => {
    try {
      // This would be replaced with actual API call
      const response = await fetch("/api/warranties", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setWarranties(data);
      }
    } catch (error) {
      console.error("Failed to fetch warranties:", error);
    }
  };

  const handleDelete = async (warrantyId: number) => {
    if (window.confirm("Are you sure you want to delete this warranty?")) {
      if (onDelete) {
        onDelete(warrantyId);
      }

      try {
        const response = await fetch(`/api/warranties/${warrantyId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (response.ok) {
          setWarranties(warranties.filter((w) => w.garantieId !== warrantyId));
        }
      } catch (error) {
        console.error("Failed to delete warranty:", error);
      }
    }
  };

  const isExpired = (expirationDate: string) => {
    return new Date(expirationDate) < new Date();
  };

  const getExpirationStatus = (expirationDate: string) => {
    const expDate = new Date(expirationDate);
    const now = new Date();
    const daysUntilExpiration = Math.ceil(
      (expDate.getTime() - now.getTime()) / (1000 * 3600 * 24),
    );

    if (daysUntilExpiration < 0) {
      return {
        status: "expired",
        text: "Expired",
        class: "bg-red-100 text-red-800",
      };
    } else if (daysUntilExpiration <= 30) {
      return {
        status: "expiring",
        text: `${daysUntilExpiration} days left`,
        class: "bg-yellow-100 text-yellow-800",
      };
    } else {
      return {
        status: "valid",
        text: "Valid",
        class: "bg-green-100 text-green-800",
      };
    }
  };

  const filteredAndSortedWarranties = warranties
    .filter((warranty) => {
      const matchesSearch =
        warranty.garantieNom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        warranty.article.articleNom
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        warranty.article.articleModele
          .toLowerCase()
          .includes(searchTerm.toLowerCase());

      const matchesFilter =
        filterStatus === "all" ||
        (filterStatus === "valid" &&
          warranty.garantieIsValide &&
          !isExpired(warranty.garantieFin)) ||
        (filterStatus === "expired" &&
          (!warranty.garantieIsValide || isExpired(warranty.garantieFin)));

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.garantieNom.localeCompare(b.garantieNom);
        case "expiration":
          return (
            new Date(a.garantieFin).getTime() -
            new Date(b.garantieFin).getTime()
          );
        case "article":
          return a.article.articleNom.localeCompare(b.article.articleNom);
        default:
          return 0;
      }
    });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Warranties</h2>
        {onAdd && (
          <button
            onClick={onAdd}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Add Warranty
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search warranties..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="expiration">Sort by Expiration</option>
            <option value="name">Sort by Name</option>
            <option value="article">Sort by Article</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as typeof filterStatus)
            }
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Warranties</option>
            <option value="valid">Valid Only</option>
            <option value="expired">Expired Only</option>
          </select>
        </div>
      </div>

      {/* Warranties Grid */}
      {filteredAndSortedWarranties.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-500 mb-4">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No warranties found
          </h3>
          <p className="text-gray-500">
            {searchTerm || filterStatus !== "all"
              ? "Try adjusting your search or filter criteria."
              : "Get started by adding your first warranty."}
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedWarranties.map((warranty) => {
            const expirationStatus = getExpirationStatus(warranty.garantieFin);

            return (
              <div
                key={warranty.garantieId}
                className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">
                      {warranty.garantieNom}
                    </h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${expirationStatus.class}`}
                    >
                      {expirationStatus.text}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600">
                    <p>
                      <span className="font-medium">Article:</span>{" "}
                      {warranty.article.articleNom}
                    </p>
                    <p>
                      <span className="font-medium">Model:</span>{" "}
                      {warranty.article.articleModele}
                    </p>
                    <p>
                      <span className="font-medium">Purchase Date:</span>{" "}
                      {new Date(
                        warranty.garantieDateAchat,
                      ).toLocaleDateString()}
                    </p>
                    <p>
                      <span className="font-medium">Duration:</span>{" "}
                      {warranty.garantieDuration} months
                    </p>
                    <p>
                      <span className="font-medium">Expires:</span>{" "}
                      {new Date(warranty.garantieFin).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex justify-end space-x-2 mt-4 pt-4 border-t border-gray-100">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(warranty)}
                        className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(warranty.garantieId)}
                      className="px-3 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WarrantiesList;
