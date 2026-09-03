'use client';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export default function Home() {
  const [orders, setOrders] = useState([]);
  const [filterZone, setFilterZone] = useState('todos');
  const [filterStatus, setFilterStatus] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [adSpend, setAdSpend] = useState('');

  // Persistencia del gasto de ads en memoria local
  useEffect(() => {
    const savedSpend = localStorage.getItem('cod_daily_ad_spend');
    if (savedSpend) setAdSpend(savedSpend);
  }, []);

  const handleSpendChange = (val) => {
    setAdSpend(val);
    localStorage.setItem('cod_daily_ad_spend', val);
  };

  // Cargar pedidos desde Supabase
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

    // Tiempo real: actualiza instantáneamente con cada nueva venta
    const channel = supabase
      .channel('realtime_dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => fetchOrders()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Cambiar estado del pedido
  const updateStatus = async (id, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    fetchOrders();
  };

  // Actualizar adelanto de envío (Yape/Plin)
  const updateAdvance = async (id, advance) => {
    const amount = parseFloat(advance) || 0;
    await supabase.from('orders').update({ advance_payment: amount }).eq('id', id);
    fetchOrders();
  };

  // ===================== CÁLCULOS & MÉTRICAS UNIT ECONOMICS =====================
  const metrics = useMemo(() => {
    const totalOrders = orders.length;
    const validOrders = orders.filter((o) => o.status !== 'cancelado');
    
    // Pedidos confirmados o avanzados en la cadena de entrega
    const confirmedOrders = orders.filter((o) =>
      ['confirmado', 'en_ruta', 'entregado'].includes(o.status)
    );
    const deliveredOrders = orders.filter((o) => o.status === 'entregado');
    const pendingOrders = orders.filter((o) => o.status === 'pendiente');

    // Facturación
    const totalPotentialRevenue = validOrders.reduce(
      (acc, o) => acc + (parseFloat(o.total_amount) || 0),
      0
    );
    const totalConfirmedRevenue = confirmedOrders.reduce(
      (acc, o) => acc + (parseFloat(o.total_amount) || 0),
      0
    );

    // Ratios operativos
    const confirmationRate = totalOrders > 0
      ? ((confirmedOrders.length / totalOrders) * 100).toFixed(1)
      : 0;

    const avgTicket = confirmedOrders.length > 0
      ? totalConfirmedRevenue / confirmedOrders.length
      : 0;

    // Métricas publicitarias
    const spend = parseFloat(adSpend) || 0;
    const rawCPA = totalOrders > 0 && spend > 0 ? (spend / totalOrders).toFixed(2) : '0.00';
    const realCPA = confirmedOrders.length > 0 && spend > 0
      ? (spend / confirmedOrders.length).toFixed(2)
      : '0.00';
    const roas = spend > 0 ? (totalConfirmedRevenue / spend).toFixed(2) : '0.00';

    return {
      totalOrders,
      confirmedCount: confirmedOrders.length,
      deliveredCount: deliveredOrders.length,
      pendingCount: pendingOrders.length,
      confirmationRate,
      totalConfirmedRevenue,
      avgTicket,
      spend,
      rawCPA,
      realCPA,
      roas,
    };
  }, [orders, adSpend]);

  // Filtrado de la lista
  const filteredOrders = orders.filter((o) => {
    const matchZone = filterZone === 'todos' || o.zone === filterZone;
    const matchStatus = filterStatus === 'todos' || o.status === filterStatus;
    return matchZone && matchStatus;
  });

  return (
    <main className="min-h-screen bg-[#090b0e] text-zinc-100 p-4 md:p-8 font-sans antialiased">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER PRINCIPAL */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#11141a] p-5 rounded-2xl border border-zinc-800/80 shadow-2xl">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black tracking-tight text-white">COD MANAGER</h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Webhook en Vivo
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1">Control operativo y unit economics de contraentrega</p>
          </div>

          {/* INPUT GASTO EN ADS */}
          <div className="flex items-center gap-3 bg-zinc-900/90 border border-zinc-800 p-2.5 rounded-xl">
            <div className="text-left">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Gasto Ads Hoy</label>
              <div className="flex items-center text-sm font-bold text-white">
                <span className="text-zinc-500 mr-1.5">S/</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={adSpend}
                  onChange={(e) => handleSpendChange(e.target.value)}
                  className="bg-transparent w-24 text-white font-mono text-sm focus:outline-none border-b border-zinc-700 focus:border-emerald-400"
                />
              </div>
            </div>
          </div>
        </header>

        {/* PANEL DE MÉTRICAS */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-[#11141a] border border-zinc-800/80 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Confirmación</span>
            <div className="mt-1 flex items-baseline gap-1">
              <span className="text-2xl font-black text-white">{metrics.confirmationRate}%</span>
              <span className="text-[10px] text-zinc-500">({metrics.confirmedCount}/{metrics.totalOrders})</span>
            </div>
          </div>

          <div className="bg-[#11141a] border border-zinc-800/80 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">CPA Bruto</span>
            <div className="mt-1">
              <span className="text-2xl font-black text-zinc-300">S/ {metrics.rawCPA}</span>
            </div>
          </div>

          <div className="bg-[#11141a] border border-zinc-800/80 p-3.5 rounded-xl border-l-2 border-l-amber-500">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">CPA Real (Efectivo)</span>
            <div className="mt-1">
              <span className="text-2xl font-black text-amber-300">S/ {metrics.realCPA}</span>
            </div>
          </div>

          <div className="bg-[#11141a] border border-zinc-800/80 p-3.5 rounded-xl border-l-2 border-l-emerald-500">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 block">ROAS Real</span>
            <div className="mt-1">
              <span className="text-2xl font-black text-emerald-300">{metrics.roas}x</span>
            </div>
          </div>

          <div className="bg-[#11141a] border border-zinc-800/80 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Ticket Medio</span>
            <div className="mt-1">
              <span className="text-2xl font-black text-zinc-200">S/ {metrics.avgTicket.toFixed(1)}</span>
            </div>
          </div>

          <div className="bg-[#11141a] border border-zinc-800/80 p-3.5 rounded-xl">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Fact. Confirmada</span>
            <div className="mt-1">
              <span className="text-2xl font-black text-emerald-400">S/ {metrics.totalConfirmedRevenue.toFixed(0)}</span>
            </div>
          </div>
        </section>

        {/* FILTROS DE VISTA */}
        <section className="flex flex-wrap items-center justify-between gap-3 pt-2">
          {/* Zona */}
          <div className="flex items-center gap-1.5 bg-[#11141a] p-1 rounded-xl border border-zinc-800">
            {['todos', 'lima', 'provincia'].map((z) => (
              <button
                key={z}
                onClick={() => setFilterZone(z)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition ${
                  filterZone === z
                    ? 'bg-zinc-100 text-zinc-950 shadow-md'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {z} ({orders.filter((o) => (z === 'todos' ? true : o.zone === z)).length})
              </button>
            ))}
          </div>

          {/* Estado */}
          <div className="flex items-center gap-1.5 bg-[#11141a] p-1 rounded-xl border border-zinc-800">
            {['todos', 'pendiente', 'confirmado', 'en_ruta', 'entregado', 'cancelado'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition ${
                  filterStatus === st
                    ? 'bg-zinc-700 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </section>

        {/* GRID DE PEDIDOS */}
        {loading ? (
          <div className="text-center py-20 text-zinc-500 text-sm">Cargando pedidos...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl">
            <p className="text-zinc-500 text-sm">No se encontraron pedidos con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const cleanPhone = (order.phone || '').replace(/\D/g, '');
              const total = parseFloat(order.total_amount || 0);
              const advance = parseFloat(order.advance_payment || 0);
              const balance = total - advance;

              // Plantilla de WhatsApp inteligente según zona
              let msg = '';
              if (order.zone === 'lima') {
                msg = `Hola ${order.customer_name}, te saludamos de la tienda para coordinar la entrega de tu pedido ${order.order_number} por S/ ${balance.toFixed(2)}. El despacho es a tu domicilio (${order.address}, ${order.city}) con pago contraentrega en efectivo o Yape al recibir. ¿Me confirmas para programarlo con el motorizado?`;
              } else {
                msg = `Hola ${order.customer_name}, te saludamos de la tienda para coordinar el envío de tu pedido ${order.order_number} a ${order.city}. El despacho es por agencia Shalom con pago contraentrega por S/ ${balance.toFixed(2)}. ¿Me confirmas tu DNI${order.customer_dni ? ` (${order.customer_dni})` : ''} y qué agencia de Shalom te queda más cómoda para recoger?`;
              }
              const waUrl = `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(msg)}`;

              return (
                <div
                  key={order.id || order.shopify_order_id}
                  className="bg-[#11141a] border border-zinc-800/90 hover:border-zinc-700 rounded-2xl p-5 flex flex-col justify-between transition shadow-lg space-y-4"
                >
                  {/* Encabezado Pedido */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold bg-zinc-800/90 text-zinc-300 px-2.5 py-1 rounded-md border border-zinc-700/50">
                        {order.order_number}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                          order.zone === 'lima'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        }`}
                      >
                        {order.zone} • {order.courier || (order.zone === 'lima' ? 'motorizado' : 'shalom')}
                      </span>
                    </div>

                    <div>
                      <h2 className="font-bold text-white text-base leading-snug">{order.customer_name}</h2>
                      <p className="text-xs text-zinc-400 mt-0.5">{order.phone}</p>
                    </div>

                    {/* Detalle Destino */}
                    <div className="bg-zinc-950/70 p-3 rounded-xl text-xs space-y-1 text-zinc-400 border border-zinc-850">
                      <p><span className="text-zinc-500 font-medium">Destino:</span> {order.city}</p>
                      <p className="line-clamp-2"><span className="text-zinc-500 font-medium">Dirección:</span> {order.address}</p>
                      {order.customer_dni && (
                        <p><span className="text-zinc-500 font-medium">DNI:</span> {order.customer_dni}</p>
                      )}
                    </div>

                    {/* Ítems del pedido si existen */}
                    {order.items && Array.isArray(order.items) && order.items.length > 0 && (
                      <div className="text-[11px] text-zinc-400 pt-1 space-y-0.5">
                        <span className="text-zinc-500 font-semibold uppercase text-[9px] tracking-wider block">Productos</span>
                        {order.items.map((it, idx) => (
                          <div key={idx} className="flex justify-between truncate">
                            <span>• {it.title} {it.variant ? `(${it.variant})` : ''}</span>
                            <span className="font-bold text-zinc-300 ml-2">x{it.quantity}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Liquidación Financiera */}
                  <div className="space-y-3 pt-3 border-t border-zinc-800/80">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Adelanto (Yape/Plin):</span>
                      <div className="flex items-center gap-1 font-mono">
                        <span className="text-zinc-500">S/</span>
                        <input
                          type="number"
                          defaultValue={order.advance_payment || 0}
                          onBlur={(e) => updateAdvance(order.id, e.target.value)}
                          className="w-16 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-right text-xs text-amber-300 focus:outline-none focus:border-emerald-400"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-xs text-zinc-400 font-medium">Cobro al Entregar</span>
                      <span className="text-xl font-black text-emerald-400">
                        S/ {balance.toFixed(2)}
                      </span>
                    </div>

                    {/* Botones de Acción */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm"
                      >
                        WhatsApp
                      </a>
                      <select
                        value={order.status || 'pendiente'}
                        onChange={(e) => updateStatus(order.id, e.target.value)}
                        className={`text-xs font-bold rounded-xl px-2 py-2 border focus:outline-none cursor-pointer transition ${
                          order.status === 'confirmado'
                            ? 'bg-blue-900/30 text-blue-300 border-blue-700/50'
                            : order.status === 'en_ruta'
                            ? 'bg-purple-900/30 text-purple-300 border-purple-700/50'
                            : order.status === 'entregado'
                            ? 'bg-emerald-900/30 text-emerald-300 border-emerald-700/50'
                            : order.status === 'cancelado'
                            ? 'bg-rose-900/30 text-rose-300 border-rose-700/50'
                            : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
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
        )}
      </div>
    </main>
  );
}
