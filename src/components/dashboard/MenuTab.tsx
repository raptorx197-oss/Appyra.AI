"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/apiClient";

type Item = { id: string; name: string; description: string | null; price: number; isAvailable: boolean };
type Category = { id: string; name: string; items: Item[] };

export default function MenuTab() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newItem, setNewItem] = useState<Record<string, { name: string; price: string; description: string }>>({});

  function load() {
    api<Category[]>("/api/dashboard/menu").then(setCategories).catch((e) => setError(errorMessage(e)));
  }

  useEffect(load, []);

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    try {
      await api("/api/dashboard/menu/categories", { method: "POST", body: JSON.stringify({ name: newCategoryName.trim() }) });
      setNewCategoryName("");
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteCategory(id: string) {
    try {
      await api(`/api/dashboard/menu/categories/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function toggleAvailable(item: Item) {
    try {
      await api(`/api/dashboard/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ isAvailable: !item.isAvailable }) });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function updatePrice(item: Item, price: number) {
    try {
      await api(`/api/dashboard/menu/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ price }) });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteItem(id: string) {
    try {
      await api(`/api/dashboard/menu/items/${id}`, { method: "DELETE" });
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function addItem(categoryId: string) {
    const draft = newItem[categoryId];
    const price = parseFloat(draft?.price ?? "");
    if (!draft?.name?.trim() || Number.isNaN(price) || price < 0) return setError("Item name and a valid price are required.");
    try {
      await api("/api/dashboard/menu/items", {
        method: "POST",
        body: JSON.stringify({ categoryId, name: draft.name.trim(), price, description: draft.description?.trim() || null }),
      });
      setNewItem((prev) => ({ ...prev, [categoryId]: { name: "", price: "", description: "" } }));
      load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (error) return <p className="text-red-600">{error}</p>;
  if (!categories) return <p className="text-stone-500">Loading…</p>;

  return (
    <div className="space-y-6">
      {categories.map((cat) => (
        <div key={cat.id} className="rounded-lg border border-stone-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-stone-900">{cat.name}</h3>
            <button onClick={() => deleteCategory(cat.id)} className="text-xs text-red-600 hover:underline">
              Delete category
            </button>
          </div>
          <div className="mt-2 divide-y divide-stone-100">
            {cat.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-[140px] flex-1 font-medium">{item.name}</span>
                <input
                  type="number"
                  defaultValue={item.price}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!Number.isNaN(v) && v !== item.price) updatePrice(item, v);
                  }}
                  className="w-24 rounded-md border border-stone-300 px-2 py-1"
                />
                <label className="flex items-center gap-1 text-xs text-stone-500">
                  <input type="checkbox" checked={item.isAvailable} onChange={() => toggleAvailable(item)} />
                  Available
                </label>
                <button onClick={() => deleteItem(item.id)} className="text-xs text-red-600 hover:underline">
                  Delete
                </button>
              </div>
            ))}
            {cat.items.length === 0 && <p className="py-2 text-sm text-stone-400">No items in this category.</p>}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-stone-100 pt-3">
            <input
              placeholder="New item name"
              value={newItem[cat.id]?.name ?? ""}
              onChange={(e) => setNewItem((prev) => ({ ...prev, [cat.id]: { ...prev[cat.id], name: e.target.value, price: prev[cat.id]?.price ?? "", description: prev[cat.id]?.description ?? "" } }))}
              className="rounded-md border border-stone-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Price"
              type="number"
              value={newItem[cat.id]?.price ?? ""}
              onChange={(e) => setNewItem((prev) => ({ ...prev, [cat.id]: { ...prev[cat.id], price: e.target.value, name: prev[cat.id]?.name ?? "", description: prev[cat.id]?.description ?? "" } }))}
              className="w-24 rounded-md border border-stone-300 px-2 py-1 text-sm"
            />
            <button onClick={() => addItem(cat.id)} className="rounded-md bg-amber-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-900">
              Add item
            </button>
          </div>
        </div>
      ))}

      <div className="flex items-end gap-2 rounded-lg border border-dashed border-stone-300 p-4">
        <input
          placeholder="New category name"
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          className="rounded-md border border-stone-300 px-2 py-1 text-sm"
        />
        <button onClick={addCategory} className="rounded-md bg-stone-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-900">
          Add category
        </button>
      </div>
    </div>
  );
}
