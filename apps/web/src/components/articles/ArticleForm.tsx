/**
 * Article Form Component
 * Form for creating and editing articles
 */

import React, { useEffect, useMemo, useState } from "react";
import { locationsAPI } from "../../services/api";

interface Article {
  articleId?: number;
  articleNom: string;
  articleModele: string;
  articleDescription?: string | null;
  productImageUrl?: string | null;
  locationIds?: number[];
  // For create/update we submit a simplified nested warranty payload.
  // For editing, ArticlesList sends `garantie` which can include extra fields.
  garantie?:
    | {
        garantieNom: string;
        garantieDateAchat: string;
        garantieDuration: number;
      }
    | any;
}

interface Location {
  locationId: number;
  name: string;
}

interface ArticleFormProps {
  article?: Article;
  onSubmit: (article: Omit<Article, "articleId">) => void | Promise<void>;
  onCancel?: () => void;
}

const ArticleForm: React.FC<ArticleFormProps> = ({
  article,
  onSubmit,
  onCancel,
}) => {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>(
    article?.locationIds || [],
  );

  const [newLocationName, setNewLocationName] = useState("");
  const [creatingLocation, setCreatingLocation] = useState(false);

  const [formData, setFormData] = useState<Omit<Article, "articleId">>({
    articleNom: article?.articleNom || "",
    articleModele: article?.articleModele || "",
    articleDescription: article?.articleDescription || "",
    productImageUrl: article?.productImageUrl || "",
  });

  const [warrantyEnabled, setWarrantyEnabled] = useState(
    Boolean((article as any)?.garantie),
  );
  const [warrantyNom, setWarrantyNom] = useState(
    ((article as any)?.garantie?.garantieNom as string) || "",
  );
  const [warrantyDateAchat, setWarrantyDateAchat] = useState(() => {
    const raw = (article as any)?.garantie?.garantieDateAchat;
    if (!raw) return "";
    // API returns ISO string; input[type=date] expects YYYY-MM-DD
    return String(raw).slice(0, 10);
  });
  const [warrantyDuration, setWarrantyDuration] = useState<number>(
    Number((article as any)?.garantie?.garantieDuration) || 24,
  );

  useEffect(() => {
    // When switching between create/edit, keep warranty state in sync.
    setWarrantyEnabled(Boolean((article as any)?.garantie));
    setWarrantyNom(((article as any)?.garantie?.garantieNom as string) || "");
    const raw = (article as any)?.garantie?.garantieDateAchat;
    setWarrantyDateAchat(raw ? String(raw).slice(0, 10) : "");
    setWarrantyDuration(
      Number((article as any)?.garantie?.garantieDuration) || 24,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article?.articleId]);

  const selectedSet = useMemo(
    () => new Set(selectedLocationIds),
    [selectedLocationIds],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLocationsLoading(true);
        const data = await locationsAPI.getAll();
        // backend returns locations with extra fields; we only need id+name
        const mapped: Location[] = (data || []).map((l: any) => ({
          locationId: l.locationId,
          name: l.name,
        }));
        if (mounted) {
          setLocations(mapped);
          setLocationsError(null);
        }
      } catch (e) {
        if (mounted)
          setLocationsError(
            e instanceof Error ? e.message : "Failed to load locations",
          );
      } finally {
        if (mounted) setLocationsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedLocationIds.length === 0) {
      alert("Please select at least one location.");
      return;
    }

    // Convert empty strings to null for optional fields
    const submitData: any = {
      ...formData,
      articleDescription: formData.articleDescription?.trim() || null,
      productImageUrl: formData.productImageUrl?.trim() || null,
      locationIds: selectedLocationIds,
      ...(warrantyEnabled
        ? {
            garantie: {
              garantieNom: warrantyNom.trim(),
              garantieDateAchat: warrantyDateAchat,
              garantieDuration: warrantyDuration,
            },
          }
        : article?.articleId
          ? { removeGarantie: true }
          : {}),
    };

    if (warrantyEnabled) {
      if (!warrantyNom.trim()) {
        alert("Please enter a warranty name.");
        return;
      }
      if (!warrantyDateAchat) {
        alert("Please select a warranty purchase date.");
        return;
      }
      if (!warrantyDuration || warrantyDuration < 1) {
        alert("Please enter a valid warranty duration.");
        return;
      }
    }

    void onSubmit(submitData);
  };

  const toggleLocation = (id: number) => {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleCreateLocation = async () => {
    const name = newLocationName.trim();
    if (!name) return;
    try {
      setCreatingLocation(true);
      const created = await locationsAPI.create({ name });
      const loc: Location = {
        locationId: created.locationId,
        name: created.name,
      };
      setLocations((prev) => [loc, ...prev]);
      setSelectedLocationIds((prev) =>
        prev.includes(loc.locationId) ? prev : [...prev, loc.locationId],
      );
      setNewLocationName("");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to create location");
    } finally {
      setCreatingLocation(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        {article ? "Edit Article" : "Create New Article"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="articleNom"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Article Name *
          </label>
          <input
            type="text"
            id="articleNom"
            name="articleNom"
            required
            value={formData.articleNom}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter article name"
            maxLength={100}
          />
        </div>

        <div>
          <label
            htmlFor="articleModele"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Model *
          </label>
          <input
            type="text"
            id="articleModele"
            name="articleModele"
            required
            value={formData.articleModele}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter model"
            maxLength={100}
          />
        </div>

        <div>
          <label
            htmlFor="articleDescription"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Description
          </label>
          <textarea
            id="articleDescription"
            name="articleDescription"
            value={formData.articleDescription || ""}
            onChange={handleChange}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Enter description (optional)"
            maxLength={255}
          />
        </div>

        <div>
          <label
            htmlFor="productImageUrl"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Product Image URL
          </label>
          <input
            type="url"
            id="productImageUrl"
            name="productImageUrl"
            value={formData.productImageUrl || ""}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="https://example.com/image.jpg (optional)"
            maxLength={255}
          />
        </div>

        <div className="border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2">
            <input
              id="warrantyEnabled"
              type="checkbox"
              checked={warrantyEnabled}
              onChange={(e) => setWarrantyEnabled(e.target.checked)}
            />
            <label
              htmlFor="warrantyEnabled"
              className="text-sm font-medium text-gray-700"
            >
              Add warranty (optional)
            </label>
          </div>

          {warrantyEnabled && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Warranty Name
                </label>
                <input
                  type="text"
                  value={warrantyNom}
                  onChange={(e) => setWarrantyNom(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g. Manufacturer warranty"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Purchase Date
                </label>
                <input
                  type="date"
                  value={warrantyDateAchat}
                  onChange={(e) => setWarrantyDateAchat(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Duration (months)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={warrantyDuration}
                  onChange={(e) => setWarrantyDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Locations *
          </label>

          {locationsLoading ? (
            <p className="text-sm text-gray-500">Loading locations…</p>
          ) : locationsError ? (
            <p className="text-sm text-red-600">{locationsError}</p>
          ) : locations.length === 0 ? (
            <p className="text-sm text-gray-500">
              No locations yet — create one below.
            </p>
          ) : (
            <div className="border border-gray-200 rounded-md p-3 space-y-2 max-h-40 overflow-auto">
              {locations.map((loc) => (
                <label key={loc.locationId} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedSet.has(loc.locationId)}
                    onChange={() => toggleLocation(loc.locationId)}
                  />
                  <span className="text-sm text-gray-700">{loc.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="New location name"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
              maxLength={120}
            />
            <button
              type="button"
              onClick={handleCreateLocation}
              disabled={creatingLocation || !newLocationName.trim()}
              className="px-3 py-2 bg-gray-900 text-white rounded-md disabled:opacity-50"
            >
              {creatingLocation ? "Creating…" : "Create"}
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            {article ? "Update Article" : "Create Article"}
          </button>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default ArticleForm;
