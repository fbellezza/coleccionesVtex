import React, { useState, useMemo, useEffect } from 'react';
import { AuditedProduct } from '../types/vtex';
import { Download, ChevronLeft, ChevronRight, CheckCircle2, XCircle, Search as SearchIcon } from 'lucide-react';

interface ProductsTableProps {
  products: AuditedProduct[];
  total: number;
}

export const ProductsTable: React.FC<ProductsTableProps> = ({
  products,
  total,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 1. Filter across ALL products
  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(p => 
      p.productName.toLowerCase().includes(term) ||
      p.skuId.toLowerCase().includes(term) ||
      p.refId.toLowerCase().includes(term) ||
      p.tradePolicyId.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  // 2. Paginate the filtered results
  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  // Reset to page 1 when search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const exportToCSV = () => {
    const headers = ['Producto', 'ID Producto', 'SKU ID', 'Ref ID', 'Activo', 'Stock', 'Precio Lista', 'Precio Base', 'Condición Comercial'];
    const rows = filteredProducts.map(p => [
      p.productName,
      p.productId,
      p.skuId,
      p.refId,
      p.isActive ? 'Sí' : 'No',
      p.stockTotal,
      p.listPrice,
      p.basePrice,
      p.tradePolicyId
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `vtex_audit_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (products.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-zinc-200 shadow-sm">
        <p className="text-zinc-500">No se encontraron productos para auditar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex flex-col">
          <h2 className="text-lg font-semibold text-zinc-900">
            Resultados ({filteredProducts.length} de {total} productos)
          </h2>
          <p className="text-xs text-zinc-500">Mostrando página {currentPage} de {totalPages || 1}</p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
              <SearchIcon size={16} />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en todos los resultados..."
              className="block w-full pl-9 pr-3 py-2 bg-white border border-zinc-200 rounded-lg text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors text-sm font-medium shadow-sm whitespace-nowrap"
          >
            <Download size={16} />
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded-xl border border-zinc-200 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-zinc-50 border-b border-zinc-200">
              <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Producto</th>
              <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Activo</th>
              <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Stock</th>
              <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Precio Lista</th>
              <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-right">Precio Base</th>
              <th className="px-6 py-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Condición</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {paginatedProducts.length > 0 ? (
              paginatedProducts.map((product) => (
                <tr key={product.skuId} className="hover:bg-zinc-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-zinc-900">{product.productName}</span>
                      <span className="text-xs text-zinc-500">SKU: {product.skuId} | Ref: {product.refId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {product.isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                        <CheckCircle2 size={12} /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-medium">
                        <XCircle size={12} /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-zinc-700">
                    {product.stockTotal.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-zinc-700">
                    ${product.listPrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-sm text-zinc-700">
                    ${product.basePrice.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-600">
                    {product.tradePolicyId}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-zinc-500 text-sm italic">
                  No hay coincidencias para "{searchTerm}" en los resultados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-sm text-zinc-500">
            Página {currentPage} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
