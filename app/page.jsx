'use client';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export default function CodDashboard() {
  const [activeTab, setActiveTab] = useState('ventas'); // 'ventas' | 'logistica' | 'metricas'
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros de búsqueda
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [zoneFilter, setZoneFilter] = useState('todos');

  // Modal de edición
  const [editingOrder, setEditingOrder] = useState(null);

  // Formulario nuevo producto
  const [newProdName, setNewProdName] = useState('');
  const [newProdStock, setNewProdStock] = useState('');
  const [newProdCost, setNewProdCost] = useState('');

  // Parámetros financieros en memoria local
  const [adSpend, setAdSpend] = useState('');
  const [fleteLima, setFleteLima] = useState('12');
  const [fleteProv, setFleteProv] = useState('15');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAdSpend(localStorage.getItem('cod_spend') || '');
      setFleteLima(localStorage.getItem('cod_flete_lima') || '12');
      setFleteProv(localStorage.getItem('cod_flete_prov') || '15');
    }
  }, []);

  const saveConfig = (key, val, setter) => {
    setter(val);
    localStorage.setItem(key, val);
  };

  // Cargar datos en vivo
  const fetchData = async () => {
    setLoading(true);
    const [ordersRes, productsRes] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name', { ascending: true })
    ]);

    if (ordersRes.data) setOrders(ordersRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('realtime_dashboard_full')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchData())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ================= LÓGICA DE STOCK INTELIGENTE =================
  // multiplier = -1 descuenta stock (al confirmar)
  // multiplier = +1 restaura stock (si se cancela o vuelve a pendiente)
  const adjustStock = async (items, multiplier) => {
    if (!items || !Array.isArray(items)) return;

    for (const item of items) {
      const itemTitle = (item.title || '').toLowerCase().trim();
      const matchedProd = products.find((p) => {
        const pName = (p.name || '').toLowerCase().trim();
        return pName === itemTitle || itemTitle.includes(pName) || pName.includes(itemTitle);
      });

      if (matchedProd) {
        const currentStock = parseInt(matchedProd.stock) || 0;
        const qty = parseInt(item.quantity) || 1;
        const newStock = Math.max(0, currentStock + (qty * multiplier));
        await supabase.from('products').update({ stock: newStock }).eq('id', matchedProd.id);
      }
    }
  };

  const updateOrderStatus = async (order, newStatus) => {
    const isOldConfirmed = ['confirmado', 'en_ruta', 'entregado'].includes(order.status);
    const isNewConfirmed = ['confirmado', 'en_ruta', 'entregado'].includes(newStatus);

    // Caso 1: Estaba pendiente/cancelado y se confirma -> Descontar stock
    if (!isOldConfirmed && isNewConfirmed) {
      await adjustStock(order.items, -1);
    }
    // Caso 2: Estaba confirmado y pasa a cancelado o pendiente -> Devolver stock
    else if (isOldConfirmed && !isNewConfirmed) {
      await adjustStock(order.items, 1);
    }

    await supabase.from('orders').update({ status: newStatus }).eq('id', order.id);
    fetchData();
  };

  const deleteOrder = async (id, orderNumber, orderStatus, orderItems) => {
    if (!confirm(`¿Eliminar definitivamente el pedido ${orderNumber}?`)) return;
    
    // Si estaba confirmado y se elimina, devolvemos el stock al almacén
    if (['confirmado', 'en_ruta', 'entregado'].includes(orderStatus)) {
      await adjustStock(orderItems, 1);
    }

    await supabase.from('orders').delete().eq('id', id);
    fetchData();
  };

  const updateField = async (id, field, value) => {
    await supabase.from('orders').update({ [field]: value }).eq('id', id);
    fetchData();
  };

  const saveEditedOrder = async (e) => {
    e.preventDefault();
    const original = orders.find((o) => o.id === editingOrder.id);
    if (original && original.status !== editingOrder.status) {
      const isOldConf = ['confirmado', 'en_ruta', 'entregado'].includes(original.status);
      const isNewConf = ['confirmado', 'en_ruta', 'entregado'].includes(editingOrder.status);
      if (!isOldConf && isNewConf) await adjustStock(original.items, -1);
      if (isOldConf && !isNewConf) await adjustStock(original.items, 1);
    }

    await supabase
      .from('orders')
      .update({
        customer_name: editingOrder.customer_name,
        phone: editingOrder.phone,
        city: editingOrder.city,
        address: editingOrder.address,
        customer_dni: editingOrder.customer_dni,
        zone: editingOrder.zone,
        total_amount: parseFloat(editingOrder.total_amount) || 0,
        advance_payment: parseFloat(editingOrder.advance_payment) || 0,
        status: editingOrder.status,
      })
      .eq('id', editingOrder.id);

    setEditingOrder(null);
    fetchData();
  };

  // ================= GESTIÓN DE PRODUCTOS =================
  const addProduct = async (e) => {
    e.preventDefault();
    if (!newProdName) return;
    await supabase.from('products').insert([
      {
        name: newProdName,
        stock: parseInt(newProdStock) || 0,
        cost_price: parseFloat(newProdCost) || 0.00,
      }
    ]);
    setNewProdName('');
    setNewProdStock('');
    setNewProdCost('');
    fetchData();
  };

  const updateProductStock = async (id, stock) => {
    await supabase.from('products').update({ stock: parseInt(stock) || 0 }).eq('id', id);
    fetchData();
  };

  const updateProductCost = async (id, cost) => {
    await supabase.from('products').update({ cost_price: parseFloat(cost) || 0 }).eq('id', id);
    fetchData();
  };

  // ================= CÁLCULO DE MÉTRICAS & GANANCIA REAL =================
  const metrics = useMemo(() => {
    const totalShopifyOrders = orders.length; // Total clientes que llegaron de Shopify
    const confirmedOrders = orders.filter((o) => ['confirmado', 'en_ruta', 'entregado'].includes(o.status));
    const deliveredOrders = orders.filter((o) => o.status === 'entregado');
    const canceledOrders = orders.filter((o) => o.status === 'cancelado');
    const pendingOrders = orders.filter((o) => o.status === 'pendiente');

    const confirmedRevenue = confirmedOrders.reduce((acc, o) => acc + (parseFloat(o.total_amount) || 0), 0);

    const spend = parseFloat(adSpend) || 0;
    const fLima = parseFloat(fleteLima) || 0;
    const fProv = parseFloat(fleteProv) || 0;

    // Costo de mercadería de productos confirmados
    const totalCOGS = confirmedOrders.reduce((acc, o) => {
      if (o.items && Array.isArray(o.items) && o.items.length > 0) {
        return (
          acc +
          o.items.reduce((subAcc, it) => {
            const itTitle = (it.title || '').toLowerCase().trim();
            const match = products.find((p) => {
              const pName = (p.name || '').toLowerCase().trim();
              return pName === itTitle || itTitle.includes(pName) || pName.includes(itTitle);
            });
            const unitCost = match ? parseFloat(match.cost_price || 0) : 25;
            return subAcc + unitCost * (parseInt(it.quantity) || 1);
          }, 0)
        );
      }
      return acc + 25;
    }, 0);

    // Costo total de flete
    const totalShipping = confirmedOrders.reduce((acc, o) => {
      return acc + (o.zone === 'lima' ? fLima : fProv);
    }, 0);

    // Inversión Total del Negocio (Ads + COGS + Envíos)
    const totalInvestment = spend + totalCOGS + totalShipping;

    // GANANCIA REAL LÍQUIDA EN EL BOLSILLO
    const netProfit = confirmedRevenue - totalInvestment;

    // % de Margen Neto Real
    const marginPct = confirmedRevenue > 0 ? ((netProfit / confirmedRevenue) * 100).toFixed(1) : 0;

    // ROI (%) Real
    const roi = totalInvestment > 0 ? ((netProfit / totalInvestment) * 100).toFixed(1) : 0;

    // Ratios Publicitarios y Operativos
    const closingRate = totalShopifyOrders > 0 ? ((confirmedOrders.length / totalShopifyOrders) * 100).toFixed(1) : 0;
    const cpaAds = totalShopifyOrders > 0 && spend > 0 ? (spend / totalShopifyOrders).toFixed(2) : '0.00';
    const cpaReal = confirmedOrders.length > 0 && spend > 0 ? (spend / confirmedOrders.length).toFixed(2) : '0.00';
    const roas = spend > 0 ? (confirmedRevenue / spend).toFixed(2) : '0.00';
    const aov = confirmedOrders.length > 0 ? confirmedRevenue / confirmedOrders.length : 0;

    // Desglose de unidades vendidas por producto
    const soldByProduct = {};
    confirmedOrders.forEach((o) => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((it) => {
          const title = it.title || 'Producto General';
          soldByProduct[title] = (soldByProduct[title] || 0) + (parseInt(it.quantity) || 1);
        });
      }
    });

    return {
      totalShopifyOrders,
      confirmedCount: confirmedOrders.length,
      deliveredCount: deliveredOrders.length,
      canceledCount: canceledOrders.length,
      pendingCount: pendingOrders.length,
      closingRate,
      confirmedRevenue,
      spend,
      totalCOGS,
      totalShipping,
      totalInvestment,
      netProfit,
      marginPct,
      roi,
      cpaAds,
      cpaReal,
      roas,
      aov,
      soldByProduct,
    };
  }, [orders, products, adSpend, fleteLima, fleteProv]);

  // Filtro de órdenes
  const filteredOrders = orders.filter((o) => {
    const term = search.toLowerCase();
    const matchSearch =
      (o.order_number || '').toLowerCase().includes(term) ||
      (o.customer_name || '').toLowerCase().includes(term) ||
      (o.phone || '').includes(term) ||
      (o.city || '').toLowerCase().includes(term);

    const matchStatus = statusFilter === 'todos' || o.status === statusFilter;
    const matchZone = zoneFilter === 'todos' || o.zone === zoneFilter;

    return matchSearch && matchStatus && matchZone;
  });

  return (
    <main className="min-h-screen bg-[#090b0e] text-zinc-100 font-sans antialiased p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* BARRA SUPERIOR & NAVEGACIÓN */}
        <header className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              COD MANAGER <span className="text-emerald-400 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">PRO OPERATIVO</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">Control de despachos contraentrega, stock vivo y rentabilidad neta</p>
          </div>

          <div className="flex bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('ventas')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition ${
                activeTab === 'ventas' ? 'bg-emerald-600 text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              1. Ventas ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('logistica')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition ${
                activeTab === 'logistica' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              2. Logística & Stock
            </button>
            <button
              onClick={() => setActiveTab('metricas')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition ${
                activeTab === 'metricas' ? 'bg-purple-600 text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              3. Métricas Reales
            </button>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* SECCIÓN 1: BANDEJA DE VENTAS EN LÍNEA                                     */}
        {/* ========================================================================= */}
        {activeTab === 'ventas' && (
          <section className="space-y-4">
            {/* FILTROS POR ESTADO */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#11141a] p-3 rounded-xl border border-zinc-800">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'todos', label: 'Todos', count: orders.length, color: 'hover:bg-zinc-800' },
                  { id: 'pendiente', label: 'Pendientes', count: metrics.pendingCount, color: 'text-amber-400' },
                  { id: 'confirmado', label: 'Confirmados', count: metrics.confirmedCount, color: 'text-blue-400' },
                  { id: 'en_ruta', label: 'En Ruta', count: orders.filter((o) => o.status === 'en_ruta').length, color: 'text-purple-400' },
                  { id: 'entregado', label: 'Entregados', count: metrics.deliveredCount, color: 'text-emerald-400' },
                  { id: 'cancelado', label: 'Cancelados', count: metrics.canceledCount, color: 'text-rose-400' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition ${
                      statusFilter === tab.id
                        ? 'bg-zinc-100 text-zinc-950'
                        : `bg-zinc-900 border border-zinc-800 text-zinc-300 ${tab.color}`
                    }`}
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-zinc-900 p-1 rounded-lg border border-zinc-800 text-xs">
                {['todos', 'lima', 'provincia'].map((z) => (
                  <button
                    key={z}
                    onClick={() => setZoneFilter(z)}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase ${
                      zoneFilter === z ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {z}
                  </button>
                ))}
              </div>
            </div>

            {/* BUSCADOR */}
            <input
              type="text"
              placeholder="Buscar por cliente, teléfono, #orden o distrito..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#11141a] border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            />

            {/* TABLA EN LÍNEA */}
            <div className="bg-[#11141a] border border-zinc-800 rounded-2xl overflow-x-auto shadow-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4">#Orden</th>
                    <th className="py-3.5 px-4">Cliente</th>
                    <th className="py-3.5 px-4">Destino / Zona</th>
                    <th className="py-3.5 px-4">Productos</th>
                    <th className="py-3.5 px-4 text-right">Total</th>
                    <th className="py-3.5 px-4 text-right">Adelanto</th>
                    <th className="py-3.5 px-4 text-right">Saldo</th>
                    <th className="py-3.5 px-4">Estado</th>
                    <th className="py-3.5 px-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan="9" className="py-8 text-center text-zinc-500">Cargando despachos...</td>
                    </tr>
                  ) : filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-8 text-center text-zinc-500">No se encontraron pedidos con este filtro.</td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => {
                      const total = parseFloat(order.total_amount || 0);
                      const advance = parseFloat(order.advance_payment || 0);
                      const balance = total - advance;
                      const cleanPhone = (order.phone || '').replace(/\D/g, '');

                      let waMessage = '';
                      if (order.status === 'cancelado') {
                        waMessage = `Hola ${order.customer_name}, te saludamos de la tienda respecto a tu pedido ${order.order_number}. Vimos que no pudiste concretarlo. ¿Tuviste algún inconveniente o deseas reprogramarlo con una facilidad de entrega? Quedamos atentos para ayudarte.`;
                      } else if (order.zone === 'lima') {
                        waMessage = `Hola ${order.customer_name}, te saludamos para coordinar la entrega de tu pedido ${order.order_number} por S/ ${balance.toFixed(2)}. El despacho es a tu domicilio (${order.address}, ${order.city}) con motorizado contraentrega. ¿Me confirmas si estás disponible hoy?`;
                      } else {
                        waMessage = `Hola ${order.customer_name}, te saludamos para coordinar el envío de tu pedido ${order.order_number} a ${order.city} por Shalom contraentrega por S/ ${balance.toFixed(2)}. ¿Me confirmas tu DNI${order.customer_dni ? ` (${order.customer_dni})` : ''} y tu agencia de preferencia?`;
                      }

                      const waUrl = `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(waMessage)}`;

                      return (
                        <tr key={order.id} className="hover:bg-zinc-900/40 transition">
                          <td className="py-3 px-4 font-mono font-bold text-white whitespace-nowrap">
                            {order.order_number}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-white leading-snug">{order.customer_name}</div>
                            <div className="text-[11px] text-zinc-400 font-mono">{order.phone}</div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                order.zone === 'lima' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              }`}>
                                {order.zone}
                              </span>
                              <span className="text-zinc-300 truncate max-w-[140px]">{order.city}</span>
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate max-w-[180px]">{order.address}</div>
                          </td>
                          <td className="py-3 px-4">
                            {order.items && Array.isArray(order.items) ? (
                              <div className="text-[11px] text-zinc-300 space-y-0.5 max-w-[200px]">
                                {order.items.map((it, idx) => (
                                  <div key={idx} className="truncate">
                                    • {it.title} <span className="font-bold text-emerald-400">x{it.quantity}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-zinc-500 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-zinc-300">
                            S/ {total.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-amber-400">
                            S/ {advance.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                            S/ {balance.toFixed(2)}
                          </td>
                          <td className="py-3 px-4">
                            <select
                              value={order.status || 'pendiente'}
                              onChange={(e) => updateOrderStatus(order, e.target.value)}
                              className={`text-[11px] font-bold rounded-lg px-2 py-1 border focus:outline-none cursor-pointer ${
                                order.status === 'confirmado'
                                  ? 'bg-blue-900/40 text-blue-300 border-blue-700/60'
                                  : order.status === 'en_ruta'
                                  ? 'bg-purple-900/40 text-purple-300 border-purple-700/60'
                                  : order.status === 'entregado'
                                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60'
                                  : order.status === 'cancelado'
                                  ? 'bg-rose-900/40 text-rose-300 border-rose-700/60'
                                  : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                              }`}
                            >
                              <option value="pendiente">Pendiente</option>
                              <option value="confirmado">Confirmado</option>
                              <option value="en_ruta">En ruta</option>
                              <option value="entregado">Entregado</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-center gap-1.5">
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Contactar por WhatsApp"
                                className={`px-2.5 py-1 rounded text-[11px] font-bold text-white transition ${
                                  order.status === 'cancelado' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                                }`}
                              >
                                WA
                              </a>
                              <button
                                onClick={() => setEditingOrder(order)}
                                title="Editar pedido"
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-1 rounded text-xs"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => deleteOrder(order.id, order.order_number, order.status, order.items)}
                                title="Eliminar orden"
                                className="bg-rose-950/40 hover:bg-rose-900 text-rose-400 p-1 rounded text-xs border border-rose-900/40"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* SECCIÓN 2: LOGÍSTICA & CONTROL DE STOCK                                   */}
        {/* ========================================================================= */}
        {activeTab === 'logistica' && (
          <section className="space-y-6">
            <div className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Inventario Físico & Costo de Compra</h3>
                  <p className="text-xs text-zinc-400">El stock se resta al Confirmar y <strong>se devuelve automáticamente si se Cancela</strong>.</p>
                </div>

                <form onSubmit={addProduct} className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="Nombre del Producto"
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-xs text-white"
                  />
                  <input
                    type="number"
                    placeholder="Stock"
                    value={newProdStock}
                    onChange={(e) => setNewProdStock(e.target.value)}
                    className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                  />
                  <input
                    type="number"
                    placeholder="Costo S/"
                    value={newProdCost}
                    onChange={(e) => setNewProdCost(e.target.value)}
                    className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white"
                  />
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1 rounded">
                    + Añadir
                  </button>
                </form>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {products.length === 0 ? (
                  <p className="text-xs text-zinc-500">No hay productos registrados en la base de datos.</p>
                ) : (
                  products.map((prod) => (
                    <div key={prod.id} className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 flex justify-between items-center">
                      <div>
                        <h4 className="font-bold text-white text-xs">{prod.name}</h4>
                        <div className="flex items-center gap-1 text-[11px] text-zinc-400 mt-1">
                          <span>Costo: S/</span>
                          <input
                            type="number"
                            defaultValue={prod.cost_price}
                            onBlur={(e) => updateProductCost(prod.id, e.target.value)}
                            className="w-14 bg-zinc-900 border border-zinc-700 rounded px-1 text-right text-white font-mono"
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-zinc-500 uppercase block font-bold">Stock Físico</span>
                        <input
                          type="number"
                          defaultValue={prod.stock}
                          onBlur={(e) => updateProductStock(prod.id, e.target.value)}
                          className={`w-16 font-mono font-bold text-sm text-center rounded border px-1 py-0.5 ${
                            prod.stock <= 5 ? 'bg-rose-950/40 text-rose-300 border-rose-700' : 'bg-zinc-900 text-emerald-300 border-zinc-700'
                          }`}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* TABLA DE DESPACHOS Y GUÍAS SHALOM */}
            <div className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 space-y-4">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Despachos Confirmados & Clave Shalom</h3>
              <div className="divide-y divide-zinc-800">
                {orders
                  .filter((o) => ['confirmado', 'en_ruta'].includes(o.status))
                  .map((order) => {
                    const balance = (parseFloat(order.total_amount) || 0) - (parseFloat(order.advance_payment) || 0);
                    const cleanPhone = (order.phone || '').replace(/\D/g, '');

                    const msgShalom = `Hola ${order.customer_name}, tu pedido ${order.order_number} ya fue despachado por Shalom 📦\n\n• Destino: ${order.city}\n• Clave / N° Guía: ${order.tracking_code || '[PENDIENTE]'}\n• Saldo a pagar al recoger: S/ ${balance.toFixed(2)}\n\nPuedes recogerlo con tu DNI (${order.customer_dni || 'titular'}).`;
                    const waShalomUrl = `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(msgShalom)}`;

                    return (
                      <div key={order.id} className="py-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-white">{order.order_number}</span>
                            <span className="font-bold text-zinc-200 text-xs">{order.customer_name}</span>
                            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded ${
                              order.zone === 'lima' ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'
                            }`}>
                              {order.zone}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-400">{order.city} - {order.address} | DNI: {order.customer_dni || 'Sin DNI'}</p>
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                          {order.zone !== 'lima' ? (
                            <>
                              <input
                                type="text"
                                placeholder="Clave / Guía Shalom"
                                defaultValue={order.tracking_code || ''}
                                onBlur={(e) => updateField(order.id, 'tracking_code', e.target.value)}
                                className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono w-40"
                              />
                              <a
                                href={waShalomUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-2.5 py-1 rounded"
                              >
                                Enviar Clave
                              </a>
                            </>
                          ) : (
                            <span className="text-xs text-blue-400 font-medium">Asignado a Motorizado</span>
                          )}

                          <select
                            value={order.status}
                            onChange={(e) => updateOrderStatus(order, e.target.value)}
                            className="bg-zinc-800 text-xs text-zinc-200 rounded px-2 py-1 border border-zinc-700 font-bold"
                          >
                            <option value="confirmado">Confirmado</option>
                            <option value="en_ruta">En ruta</option>
                            <option value="entregado">Entregado</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* SECCIÓN 3: MÉTRICAS REALES Y FINANZAS COMPLETAS                           */}
        {/* ========================================================================= */}
        {activeTab === 'metricas' && (
          <section className="space-y-6">
            {/* INPUTS DE COSTOS */}
            <div className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 space-y-3">
              <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Parámetros Financieros</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <label className="block text-[10px] uppercase font-bold text-zinc-400">Gasto de Publicidad (Ads)</label>
                  <div className="flex items-center text-sm font-bold text-white mt-1">
                    <span className="text-zinc-500 mr-1">S/</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={adSpend}
                      onChange={(e) => saveConfig('cod_spend', e.target.value, setAdSpend)}
                      className="bg-transparent w-full focus:outline-none font-mono text-emerald-400"
                    />
                  </div>
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <label className="block text-[10px] uppercase font-bold text-zinc-400">Flete Motorizado Lima</label>
                  <div className="flex items-center text-sm font-bold text-white mt-1">
                    <span className="text-zinc-500 mr-1">S/</span>
                    <input
                      type="number"
                      value={fleteLima}
                      onChange={(e) => saveConfig('cod_flete_lima', e.target.value, setFleteLima)}
                      className="bg-transparent w-full focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <label className="block text-[10px] uppercase font-bold text-zinc-400">Flete Shalom Provincia</label>
                  <div className="flex items-center text-sm font-bold text-white mt-1">
                    <span className="text-zinc-500 mr-1">S/</span>
                    <input
                      type="number"
                      value={fleteProv}
                      onChange={(e) => saveConfig('cod_flete_prov', e.target.value, setFleteProv)}
                      className="bg-transparent w-full focus:outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* GRILLA DE LAS MÉTRICAS SOLICITADAS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              
              {/* 1. PEDIDOS SHOPIFY (LLEGADOS) */}
              <div className="bg-[#11141a] border border-zinc-800 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">Pedidos Shopify (Entrantes)</span>
                <span className="text-3xl font-black text-white font-mono block mt-1">
                  {metrics.totalShopifyOrders}
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Clientes que enviaron formulario</p>
              </div>

              {/* 2. CONFIRMADOS & % CIERRE */}
              <div className="bg-[#11141a] border border-blue-500/40 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-blue-400 block">Confirmados & % Cierre</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-blue-300 font-mono">{metrics.confirmedCount}</span>
                  <span className="text-sm font-bold text-zinc-400 font-mono">({metrics.closingRate}%)</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Tasa de confirmación efectiva</p>
              </div>

              {/* 3. CPA ADS (BRUTO) */}
              <div className="bg-[#11141a] border border-zinc-800 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">CPA Ads (Bruto Shopify)</span>
                <span className="text-3xl font-black text-zinc-200 font-mono block mt-1">
                  S/ {metrics.cpaAds}
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Gasto Ads / Total Pedidos</p>
              </div>

              {/* 4. CPA REAL (EFECTIVO) */}
              <div className="bg-[#11141a] border border-amber-500/50 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-amber-400 block">CPA Real (Efectivo)</span>
                <span className="text-3xl font-black text-amber-300 font-mono block mt-1">
                  S/ {metrics.cpaReal}
                </span>
                <p className="text-[11px] text-amber-400/80 mt-1">Gasto Ads / Confirmados</p>
              </div>

              {/* 5. GANANCIA REAL LÍQUIDA */}
              <div className="bg-gradient-to-br from-emerald-950/60 via-[#11141a] to-[#11141a] border-2 border-emerald-500/50 p-4 rounded-2xl">
                <span className="text-[10px] font-black uppercase text-emerald-400 block">Ganancia Real Líquida</span>
                <span className="text-3xl font-black text-emerald-300 font-mono block mt-1">
                  S/ {metrics.netProfit.toFixed(2)}
                </span>
                <p className="text-[11px] text-emerald-400 mt-1">Limpio en bolsillo tras todo gasto</p>
              </div>

              {/* 6. % DE MARGEN NETO */}
              <div className="bg-[#11141a] border border-emerald-500/30 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-emerald-400 block">% Margen Neto</span>
                <span className="text-3xl font-black text-emerald-300 font-mono block mt-1">
                  {metrics.marginPct}%
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Utilidad / Facturación</p>
              </div>

              {/* 7. ROAS REAL */}
              <div className="bg-[#11141a] border border-zinc-800 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-blue-400 block">ROAS Real</span>
                <span className="text-3xl font-black text-blue-300 font-mono block mt-1">
                  {metrics.roas}x
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Facturación / Gasto Ads</p>
              </div>

              {/* 8. ROI (%) */}
              <div className="bg-[#11141a] border border-purple-500/40 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-purple-400 block">ROI (%) Inversión Total</span>
                <span className="text-3xl font-black text-purple-300 font-mono block mt-1">
                  {metrics.roi}%
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Retorno sobre Ads + Stock + Fletes</p>
              </div>

            </div>

            {/* TABLA DE STOCK VENDIDO POR PRODUCTO */}
            <div className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Resumen de Stock Vendido de Cada Producto
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.keys(metrics.soldByProduct).length === 0 ? (
                  <p className="text-xs text-zinc-500">Aún no hay unidades vendidas en pedidos confirmados.</p>
                ) : (
                  Object.entries(metrics.soldByProduct).map(([prodName, qty]) => {
                    const matched = products.find((p) => (p.name || '').toLowerCase().trim() === prodName.toLowerCase().trim());
                    const currentStock = matched ? matched.stock : 'N/A';

                    return (
                      <div key={prodName} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex justify-between items-center">
                        <div>
                          <h4 className="font-bold text-white text-xs">{prodName}</h4>
                          <span className="text-[11px] text-zinc-400 mt-0.5 block">
                            Stock en Almacén: <strong className="text-white font-mono">{currentStock}</strong>
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase text-emerald-400 block">Vendido</span>
                          <span className="text-xl font-black text-emerald-300 font-mono">{qty} und</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ESTADO DE RESULTADOS DETALLADO */}
            <div className="bg-[#11141a] p-6 rounded-2xl border border-zinc-800 space-y-2 font-mono text-sm">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-sans mb-3">Flujo de Caja Real (Desglose)</h4>
              <div className="flex justify-between text-emerald-400">
                <span>(+) Facturación Confirmada</span>
                <span>S/ {metrics.confirmedRevenue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-400">
                <span>(-) Gasto de Publicidad (Ads)</span>
                <span>- S/ {metrics.spend.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-400">
                <span>(-) Costo de Mercadería Vendida (COGS)</span>
                <span>- S/ {metrics.totalCOGS.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-400">
                <span>(-) Costo de Envíos (Fletes)</span>
                <span>- S/ {metrics.totalShipping.toFixed(2)}</span>
              </div>
              <div className="border-t border-zinc-800 pt-3 flex justify-between text-base font-black text-white font-sans">
                <span>(=) Ganancia Real Líquida</span>
                <span className={metrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  S/ {metrics.netProfit.toFixed(2)}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* MODAL DE EDICIÓN */}
        {editingOrder && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <form onSubmit={saveEditedOrder} className="bg-[#11141a] border border-zinc-800 rounded-2xl p-6 max-w-lg w-full space-y-4">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
                <h3 className="font-bold text-white text-base">Editar Pedido {editingOrder.order_number}</h3>
                <button type="button" onClick={() => setEditingOrder(null)} className="text-zinc-400 hover:text-white">✕</button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-zinc-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={editingOrder.customer_name}
                    onChange={(e) => setEditingOrder({ ...editingOrder, customer_name: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={editingOrder.phone}
                    onChange={(e) => setEditingOrder({ ...editingOrder, phone: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Ciudad / Destino</label>
                  <input
                    type="text"
                    value={editingOrder.city}
                    onChange={(e) => setEditingOrder({ ...editingOrder, city: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">DNI</label>
                  <input
                    type="text"
                    value={editingOrder.customer_dni || ''}
                    onChange={(e) => setEditingOrder({ ...editingOrder, customer_dni: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-zinc-400 mb-1">Dirección / Referencia</label>
                  <input
                    type="text"
                    value={editingOrder.address}
                    onChange={(e) => setEditingOrder({ ...editingOrder, address: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Zona</label>
                  <select
                    value={editingOrder.zone}
                    onChange={(e) => setEditingOrder({ ...editingOrder, zone: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                  >
                    <option value="lima">Lima (Motorizado)</option>
                    <option value="provincia">Provincia (Shalom)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Adelanto (S/)</label>
                  <input
                    type="number"
                    value={editingOrder.advance_payment}
                    onChange={(e) => setEditingOrder({ ...editingOrder, advance_payment: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setEditingOrder(null)}
                  className="px-4 py-2 rounded-lg text-xs bg-zinc-800 text-zinc-300 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        )}

      </div>
    </main>
  );
}
