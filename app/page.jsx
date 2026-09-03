'use client';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [activeTab, setActiveTab] = useState('ventas'); // 'ventas', 'logistica', 'metricas'
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Estados financieros (se guardan localmente para no perderlos al recargar)
  const [adSpend, setAdSpend] = useState('');
  const [defaultProductCost, setDefaultProductCost] = useState('25'); // Costo producto promedio
  const [shippingCostLima, setShippingCostLima] = useState('12'); // Flete motorizado
  const [shippingCostProv, setShippingCostProv] = useState('15'); // Flete Shalom

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAdSpend(localStorage.getItem('cod_spend') || '');
      setDefaultProductCost(localStorage.getItem('cod_cogs') || '25');
      setShippingCostLima(localStorage.getItem('cod_ship_lima') || '12');
      setShippingCostProv(localStorage.getItem('cod_ship_prov') || '15');
    }
  }, []);

  const saveConfig = (key, val, setter) => {
    setter(val);
    localStorage.setItem(key, val);
  };

  // Traer datos de Supabase
  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setOrders(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('realtime_hub')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Actualizadores rápidos
  const updateStatus = async (id, status) => {
    await supabase.from('orders').update({ status }).eq('id', id);
    fetchOrders();
  };

  const updateField = async (id, field, value) => {
    await supabase.from('orders').update({ [field]: value }).eq('id', id);
    fetchOrders();
  };

  // ==================== CÁLCULO DE MÉTRICAS & GANANCIA REAL ====================
  const financialMetrics = useMemo(() => {
    const totalOrders = orders.length;
    const confirmedOrders = orders.filter((o) => ['confirmado', 'en_ruta', 'entregado'].includes(o.status));
    const deliveredOrders = orders.filter((o) => o.status === 'entregado');
    const canceledOrders = orders.filter((o) => o.status === 'cancelado');

    const confirmedRevenue = confirmedOrders.reduce((acc, o) => acc + (parseFloat(o.total_amount) || 0), 0);
    const deliveredRevenue = deliveredOrders.reduce((acc, o) => acc + (parseFloat(o.total_amount) || 0), 0);

    const spend = parseFloat(adSpend) || 0;
    const unitCost = parseFloat(defaultProductCost) || 0;
    const fleteLima = parseFloat(shippingCostLima) || 0;
    const fleteProv = parseFloat(shippingCostProv) || 0;

    // Costo de mercadería de los pedidos confirmados
    const totalCOGS = confirmedOrders.reduce((acc, o) => {
      const itemsCount = (o.items && Array.isArray(o.items))
        ? o.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
        : 1;
      return acc + (itemsCount * unitCost);
    }, 0);

    // Costo total de envíos (Lima + Provincia)
    const totalShipping = confirmedOrders.reduce((acc, o) => {
      return acc + (o.zone === 'lima' ? fleteLima : fleteProv);
    }, 0);

    // 🔥 GANANCIA NETA EN BOLSILLO
    const netProfit = confirmedRevenue - spend - totalCOGS - totalShipping;
    const profitMargin = confirmedRevenue > 0 ? ((netProfit / confirmedRevenue) * 100).toFixed(1) : 0;

    // Ratios
    const rawCPA = totalOrders > 0 && spend > 0 ? (spend / totalOrders).toFixed(2) : '0.00';
    const realCPA = confirmedOrders.length > 0 && spend > 0 ? (spend / confirmedOrders.length).toFixed(2) : '0.00';
    const confirmationRate = totalOrders > 0 ? ((confirmedOrders.length / totalOrders) * 100).toFixed(1) : 0;
    const roas = spend > 0 ? (confirmedRevenue / spend).toFixed(2) : '0.00';

    return {
      totalOrders,
      confirmedCount: confirmedOrders.length,
      deliveredCount: deliveredOrders.length,
      canceledCount: canceledOrders.length,
      confirmationRate,
      confirmedRevenue,
      deliveredRevenue,
      spend,
      totalCOGS,
      totalShipping,
      netProfit,
      profitMargin,
      rawCPA,
      realCPA,
      roas,
    };
  }, [orders, adSpend, defaultProductCost, shippingCostLima, shippingCostProv]);

  // Filtro de búsqueda
  const filteredOrders = orders.filter((o) => {
    const term = search.toLowerCase();
    return (
      (o.order_number || '').toLowerCase().includes(term) ||
      (o.customer_name || '').toLowerCase().includes(term) ||
      (o.phone || '').includes(term) ||
      (o.city || '').toLowerCase().includes(term)
    );
  });

  return (
    <main className="min-h-screen bg-[#090b0e] text-zinc-100 font-sans antialiased p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER CON PESTAÑAS */}
        <header className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800/80 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              COD MANAGER <span className="text-emerald-400 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">PRO</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">Control operativo, despacho y utilidad neta real</p>
          </div>

          {/* SELECTOR DE SECCIONES (TABS) */}
          <div className="flex bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
            <button
              onClick={() => setActiveTab('ventas')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'ventas' ? 'bg-emerald-600 text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              1. Ventas & Confirmación
            </button>
            <button
              onClick={() => setActiveTab('logistica')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'logistica' ? 'bg-blue-600 text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              2. Logística & Guías
            </button>
            <button
              onClick={() => setActiveTab('metricas')}
              className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                activeTab === 'metricas' ? 'bg-purple-600 text-white shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              3. Métricas & Ganancia Real
            </button>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* SECCIÓN 1: VENTAS & CONFIRMACIÓN */}
        {/* ========================================================================= */}
        {activeTab === 'ventas' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <input
                type="text"
                placeholder="Buscar por #orden, cliente, celular o ciudad..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-96 bg-[#11141a] border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
              />
              <span className="text-xs text-zinc-500 font-mono">Total pedidos: {filteredOrders.length}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map((order) => {
                const cleanPhone = (order.phone || '').replace(/\D/g, '');
                const total = parseFloat(order.total_amount || 0);
                const advance = parseFloat(order.advance_payment || 0);
                const balance = total - advance;

                const msgLima = `Hola ${order.customer_name}, te saludamos de la tienda para coordinar la entrega de tu pedido ${order.order_number} por S/ ${balance.toFixed(2)}. El despacho es a tu domicilio (${order.address}, ${order.city}) con pago contraentrega en efectivo o Yape. ¿Me confirmas para enviártelo hoy con el motorizado?`;
                const msgProv = `Hola ${order.customer_name}, te saludamos de la tienda para coordinar el envío de tu pedido ${order.order_number} a ${order.city}. El envío es por Shalom con pago contraentrega por S/ ${balance.toFixed(2)}. ¿Me confirmas tu DNI${order.customer_dni ? ` (${order.customer_dni})` : ''} y en qué agencia Shalom deseas recogerlo?`;

                const waUrl = `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(order.zone === 'lima' ? msgLima : msgProv)}`;

                return (
                  <div key={order.id} className="bg-[#11141a] border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-lg">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-md">
                          {order.order_number}
                        </span>
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                          order.zone === 'lima' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        }`}>
                          {order.zone} • {order.zone === 'lima' ? 'Motorizado' : 'Shalom'}
                        </span>
                      </div>

                      <div>
                        <h3 className="font-bold text-white text-base leading-tight">{order.customer_name}</h3>
                        <p className="text-xs text-zinc-400 mt-0.5 font-mono">{order.phone}</p>
                      </div>

                      <div className="bg-zinc-950/70 p-3 rounded-xl text-xs space-y-1 text-zinc-400 border border-zinc-850">
                        <p><span className="text-zinc-500 font-medium">Destino:</span> {order.city}</p>
                        <p className="line-clamp-2"><span className="text-zinc-500 font-medium">Dirección:</span> {order.address}</p>
                        {order.customer_dni && <p><span className="text-zinc-500 font-medium">DNI:</span> {order.customer_dni}</p>}
                      </div>

                      {order.items && (
                        <div className="text-[11px] text-zinc-400 space-y-0.5 pt-1">
                          {order.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span className="truncate">• {it.title}</span>
                              <span className="font-bold text-zinc-200">x{it.quantity}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-3 pt-3 border-t border-zinc-800">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-500">Adelanto (Yape/Plin):</span>
                        <div className="flex items-center gap-1 font-mono">
                          <span className="text-zinc-500">S/</span>
                          <input
                            type="number"
                            defaultValue={order.advance_payment || 0}
                            onBlur={(e) => updateField(order.id, 'advance_payment', parseFloat(e.target.value) || 0)}
                            className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-right text-xs text-amber-300"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Saldo a Cobrar</span>
                        <span className="text-xl font-black text-emerald-400">S/ {balance.toFixed(2)}</span>
                      </div>

                      {/* Botones de acción */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center transition"
                        >
                          Confirmar WhatsApp
                        </a>
                        <select
                          value={order.status || 'pendiente'}
                          onChange={(e) => updateStatus(order.id, e.target.value)}
                          className="bg-zinc-800 border border-zinc-700 text-xs font-bold rounded-xl px-2 py-2 text-zinc-200"
                        >
                          <option value="pendiente">Pendiente</option>
                          <option value="confirmado">Confirmado</option>
                          <option value="en_ruta">En ruta</option>
                          <option value="entregado">Entregado</option>
                          <option value="cancelado">Cancelado</option>
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* SECCIÓN 2: LOGÍSTICA & GUÍAS SHALOM */}
        {/* ========================================================================= */}
        {activeTab === 'logistica' && (
          <section className="space-y-6">
            <div className="bg-[#11141a] p-4 rounded-xl border border-zinc-800 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Mesa de Despacho & Emisión de Guías</h2>
                <p className="text-xs text-zinc-400">Filtra pedidos confirmados listos para empaque y rotulado de Shalom/Motorizado</p>
              </div>
              <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1 rounded-lg text-xs font-bold">
                {orders.filter((o) => ['confirmado', 'en_ruta'].includes(o.status)).length} por Despachar
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* COLUMNA PROVINCIA (SHALOM / OLVA) */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-purple-400 uppercase tracking-widest border-b border-purple-500/30 pb-2 flex justify-between">
                  <span>Provincia • Shalom / Agencia</span>
                  <span>({orders.filter((o) => o.zone !== 'lima' && ['confirmado', 'en_ruta'].includes(o.status)).length})</span>
                </h3>

                {orders
                  .filter((o) => o.zone !== 'lima' && ['confirmado', 'en_ruta', 'entregado'].includes(o.status))
                  .map((order) => {
                    const cleanPhone = (order.phone || '').replace(/\D/g, '');
                    const balance = (parseFloat(order.total_amount) || 0) - (parseFloat(order.advance_payment) || 0);
                    const tracking = order.tracking_code || '';

                    const msgShalomGuia = `Hola ${order.customer_name}, ¡tu paquete ya está en camino por Shalom! 📦\n\n• Destino: ${order.city}\n• N° de Guía / Clave: ${tracking || '[PENDIENTE]'}\n• Saldo a pagar al recoger: S/ ${balance.toFixed(2)}\n\nPuedes acercarte a la agencia con tu DNI (${order.customer_dni || 'titular'}) y esta clave para retirar tu pedido.`;
                    const waGuiaUrl = `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(msgShalomGuia)}`;

                    return (
                      <div key={order.id} className="bg-[#11141a] border border-zinc-800 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-xs font-bold text-zinc-400">{order.order_number}</span>
                            <h4 className="font-bold text-white text-sm">{order.customer_name}</h4>
                            <p className="text-xs text-zinc-400">DNI: <span className="text-white font-mono">{order.customer_dni || 'Falta DNI'}</span></p>
                            <p className="text-xs text-zinc-400">Destino: {order.city} - {order.address}</p>
                          </div>
                          <span className="text-sm font-black text-emerald-400">S/ {balance.toFixed(2)}</span>
                        </div>

                        {/* INPUT PARA CLAVE SHALOM / GUÍA */}
                        <div className="bg-zinc-950 p-3 rounded-lg border border-purple-500/20 space-y-2">
                          <label className="block text-[10px] font-bold text-purple-400 uppercase tracking-wider">
                            N° Guía / Clave de Seguridad Shalom:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Ej: Guía 10459 - Clave 4821"
                              defaultValue={order.tracking_code || ''}
                              onBlur={(e) => updateField(order.id, 'tracking_code', e.target.value)}
                              className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-white font-mono focus:border-purple-400 focus:outline-none"
                            />
                            <a
                              href={waGuiaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3 py-1 rounded flex items-center whitespace-nowrap"
                            >
                              Enviar Clave WA
                            </a>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pt-1 text-xs">
                          <span className="text-zinc-500">Estado logístico:</span>
                          <select
                            value={order.status}
                            onChange={(e) => updateStatus(order.id, e.target.value)}
                            className="bg-zinc-800 text-zinc-200 rounded px-2 py-1 border border-zinc-700 text-xs font-bold"
                          >
                            <option value="confirmado">Listo para Despacho</option>
                            <option value="en_ruta">Enviado por Agencia</option>
                            <option value="entregado">Retirado / Pagado</option>
                          </select>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* COLUMNA LIMA (MOTORIZADO EXPRESS) */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest border-b border-blue-500/30 pb-2 flex justify-between">
                  <span>Lima • Motorizado Domicilio</span>
                  <span>({orders.filter((o) => o.zone === 'lima' && ['confirmado', 'en_ruta'].includes(o.status)).length})</span>
                </h3>

                {orders
                  .filter((o) => o.zone === 'lima' && ['confirmado', 'en_ruta', 'entregado'].includes(o.status))
                  .map((order) => {
                    const balance = (parseFloat(order.total_amount) || 0) - (parseFloat(order.advance_payment) || 0);

                    return (
                      <div key={order.id} className="bg-[#11141a] border border-zinc-800 rounded-xl p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-mono text-xs font-bold text-zinc-400">{order.order_number}</span>
                            <h4 className="font-bold text-white text-sm">{order.customer_name}</h4>
                            <p className="text-xs text-zinc-300 font-mono">{order.phone}</p>
                            <p className="text-xs text-zinc-400 mt-1"><span className="text-zinc-500">Dirección:</span> {order.address}, {order.city}</p>
                          </div>
                          <span className="text-sm font-black text-emerald-400">S/ {balance.toFixed(2)}</span>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-zinc-800 text-xs">
                          <span className="text-zinc-500">Estado de Ruta:</span>
                          <select
                            value={order.status}
                            onChange={(e) => updateStatus(order.id, e.target.value)}
                            className="bg-zinc-800 text-zinc-200 rounded px-2 py-1 border border-zinc-700 text-xs font-bold"
                          >
                            <option value="confirmado">Asignado a Motorizado</option>
                            <option value="en_ruta">En Ruta de Entrega</option>
                            <option value="entregado">Entregado & Cobrado</option>
                            <option value="cancelado">Rechazado en Puerta</option>
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
        {/* SECCIÓN 3: MÉTRICAS & GANANCIA REAL (UNIT ECONOMICS) */}
        {/* ========================================================================= */}
        {activeTab === 'metricas' && (
          <section className="space-y-6">
            {/* PANEL DE VARIABLES DE COSTO */}
            <div className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Parámetros de Costo Unitario (Perú)</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400">Gasto Ads del Día</label>
                  <div className="flex items-center mt-1 text-sm font-bold text-white">
                    <span className="text-zinc-500 mr-1 font-mono">S/</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={adSpend}
                      onChange={(e) => saveConfig('cod_spend', e.target.value, setAdSpend)}
                      className="bg-transparent w-full text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400">Costo Producto (COGS)</label>
                  <div className="flex items-center mt-1 text-sm font-bold text-white">
                    <span className="text-zinc-500 mr-1 font-mono">S/</span>
                    <input
                      type="number"
                      value={defaultProductCost}
                      onChange={(e) => saveConfig('cod_cogs', e.target.value, setDefaultProductCost)}
                      className="bg-transparent w-full text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400">Flete Motorizado Lima</label>
                  <div className="flex items-center mt-1 text-sm font-bold text-white">
                    <span className="text-zinc-500 mr-1 font-mono">S/</span>
                    <input
                      type="number"
                      value={shippingCostLima}
                      onChange={(e) => saveConfig('cod_ship_lima', e.target.value, setShippingCostLima)}
                      className="bg-transparent w-full text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <label className="block text-[10px] font-bold uppercase text-zinc-400">Flete Shalom Provincia</label>
                  <div className="flex items-center mt-1 text-sm font-bold text-white">
                    <span className="text-zinc-500 mr-1 font-mono">S/</span>
                    <input
                      type="number"
                      value={shippingCostProv}
                      onChange={(e) => saveConfig('cod_ship_prov', e.target.value, setShippingCostProv)}
                      className="bg-transparent w-full text-white font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* TARJETAS DE RESULTADO FINANCIERO REAL */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* GANANCIA LÍQUIDA REAL */}
              <div className="bg-gradient-to-br from-emerald-950/40 via-[#11141a] to-[#11141a] border-2 border-emerald-500/40 p-6 rounded-2xl">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400 block">Utilidad Neta Real</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-emerald-300 font-mono">
                    S/ {financialMetrics.netProfit.toFixed(2)}
                  </span>
                </div>
                <p className="text-xs text-emerald-400/80 mt-1">Margen Neto Real: <strong>{financialMetrics.profitMargin}%</strong></p>
                <p className="text-[11px] text-zinc-500 mt-3 border-t border-zinc-800 pt-2">
                  Dinero líquido tras restar Costo de Producto + Envíos + Gasto en Anuncios.
                </p>
              </div>

              {/* CPA REAL EFECTIVO */}
              <div className="bg-[#11141a] border border-amber-500/40 p-6 rounded-2xl">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400 block">CPA Real por Confirmado</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-amber-300 font-mono">
                    S/ {financialMetrics.realCPA}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">CPA Bruto (Shopify): S/ {financialMetrics.rawCPA}</p>
                <p className="text-[11px] text-zinc-500 mt-3 border-t border-zinc-800 pt-2">
                  Lo que te cuesta en ads cada pedido que de verdad vas a despachar.
                </p>
              </div>

              {/* ROAS & EFICIENCIA */}
              <div className="bg-[#11141a] border border-zinc-800 p-6 rounded-2xl">
                <span className="text-xs font-black uppercase tracking-wider text-blue-400 block">ROAS Real de Venta</span>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-black text-blue-300 font-mono">
                    {financialMetrics.roas}x
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">Tasa Confirmación: <strong>{financialMetrics.confirmationRate}%</strong></p>
                <p className="text-[11px] text-zinc-500 mt-3 border-t border-zinc-800 pt-2">
                  Facturación Confirmada: S/ {financialMetrics.confirmedRevenue.toFixed(2)}
                </p>
              </div>
            </div>

            {/* DESGLOSE ESTADO DE RESULTADOS */}
            <div className="bg-[#11141a] p-6 rounded-2xl border border-zinc-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Desglose de Caja del Día</h3>
              
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between text-emerald-400">
                  <span>(+) Facturación Confirmada</span>
                  <span>S/ {financialMetrics.confirmedRevenue.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>(-) Gasto Publicitario (Ads)</span>
                  <span>- S/ {financialMetrics.spend.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>(-) Costo de Productos (COGS)</span>
                  <span>- S/ {financialMetrics.totalCOGS.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-rose-400">
                  <span>(-) Costo de Envíos (Motorizado + Shalom)</span>
                  <span>- S/ {financialMetrics.totalShipping.toFixed(2)}</span>
                </div>
                <div className="border-t border-zinc-800 pt-2 flex justify-between text-base font-black text-white">
                  <span>(=) Ganancia Líquida en Mano</span>
                  <span className={financialMetrics.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    S/ {financialMetrics.netProfit.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

      </div>
    </main>
  );
}
