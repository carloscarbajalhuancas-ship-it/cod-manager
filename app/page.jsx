'use client';
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export default function CodDashboard() {
  // ================= ESTADO DE AUTENTICACIÓN =================
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setAuthLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmittingAuth(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    });

    if (error) {
      setLoginError('Credenciales incorrectas o usuario no registrado en Supabase.');
    }
    setIsSubmittingAuth(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // ================= ESTADOS DEL DASHBOARD =================
  const [activeTab, setActiveTab] = useState('ventas');
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedOrders, setSelectedOrders] = useState([]);

  const [datePreset, setDatePreset] = useState('hoy');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [zoneFilter, setZoneFilter] = useState('todos');
  const [sellerFilter, setSellerFilter] = useState('todos');

  const [editingOrder, setEditingOrder] = useState(null);

  const [newProdName, setNewProdName] = useState('');
  const [newProdStock, setNewProdStock] = useState('');
  const [newProdCost, setNewProdCost] = useState('');

  const [adSpend, setAdSpend] = useState('');
  const [fleteLima, setFleteLima] = useState('12');
  const [fleteProv, setFleteProv] = useState('15');
  const [sheetWebhookUrl, setSheetWebhookUrl] = useState('');
  const [syncStatus, setSyncStatus] = useState('');

  // Telegram Config
  const [tgToken, setTgToken] = useState('');
  const [tgChatId, setTgChatId] = useState('');

  // Configuración de vendedoras dinámicas
  const [sellerCount, setSellerCount] = useState(2);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAdSpend(localStorage.getItem('cod_spend') || '');
      setFleteLima(localStorage.getItem('cod_flete_lima') || '12');
      setFleteProv(localStorage.getItem('cod_flete_prov') || '15');
      setSheetWebhookUrl(localStorage.getItem('cod_sheet_url') || '');
      setTgToken(localStorage.getItem('cod_tg_token') || '');
      setTgChatId(localStorage.getItem('cod_tg_chatid') || '');

      const todayStr = new Date().toISOString().split('T')[0];
      setCustomStart(todayStr);
      setCustomEnd(todayStr);
    }
  }, []);

  const saveConfig = (key, val, setter) => {
    setter(val);
    localStorage.setItem(key, val);
  };

  // Actualizar número de vendedoras en Supabase
  const handleSellerCountChange = async (newCount) => {
    const count = parseInt(newCount) || 1;
    setSellerCount(count);
    await supabase.from('settings').upsert({ key: 'seller_count', value: String(count) });
    fetchData();
  };

  // Lista dinámica de vendedoras generada al instante (ej: ['Vendedora 1', 'Vendedora 2', 'Vendedora 3'])
  const activeSellersList = useMemo(() => {
    return Array.from({ length: sellerCount }, (_, i) => `Vendedora ${i + 1}`);
  }, [sellerCount]);

  // ================= NOTIFICACIÓN A TELEGRAM =================
  const sendTelegramNotification = async (order) => {
    const token = tgToken || localStorage.getItem('cod_tg_token');
    const chatId = tgChatId || localStorage.getItem('cod_tg_chatid');
    if (!token || !chatId) return;

    try {
      const total = parseFloat(order.total_amount || 0);
      const advance = parseFloat(order.advance_payment || 0);
      const balance = Math.max(0, total - advance);

      const productsSummary = order.items && Array.isArray(order.items)
        ? order.items.map((it) => `${it.title} (x${it.quantity})`).join(', ')
        : 'Producto General';

      const message = `🔔 *¡PEDIDO CONFIRMADO!*\n\n` +
        `📦 *Orden:* ${order.order_number}\n` +
        `👤 *Cliente:* ${order.customer_name}\n` +
        `📞 *Teléfono:* ${order.phone}\n` +
        `📍 *Destino:* ${order.city} (${order.zone?.toUpperCase()})\n` +
        `🛍️ *Productos:* ${productsSummary}\n` +
        `💰 *Total:* S/ ${total.toFixed(2)}\n` +
        `💵 *Adelanto:* S/ ${advance.toFixed(2)}\n` +
        `📌 *Saldo a Cobrar:* S/ ${balance.toFixed(2)}\n` +
        `👩‍💼 *Vendedora:* ${order.assigned_seller || 'Vendedora 1'}`;

      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
      });
    } catch (err) {
      console.error('Error enviando notificación a Telegram:', err);
    }
  };

  // ================= GOOGLE SHEETS SYNC =================
  const sendOrderToGoogleSheet = async (order) => {
    const url = sheetWebhookUrl || localStorage.getItem('cod_sheet_url');
    if (!url) return;

    try {
      setSyncStatus(`Enviando ${order.order_number} a Sheets...`);
      const total = parseFloat(order.total_amount || 0);
      const advance = parseFloat(order.advance_payment || 0);
      const balance = Math.max(0, total - advance);

      const dateObj = new Date(order.created_at || Date.now());
      const dateFormatted = `${dateObj.toLocaleDateString('es-PE')} ${dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

      const productsSummary = order.items && Array.isArray(order.items)
        ? order.items.map((it) => `${it.title} (x${it.quantity})`).join(', ')
        : 'Producto General';

      const payload = {
        order_number: order.order_number,
        date: dateFormatted,
        customer_name: order.customer_name,
        phone: order.phone,
        customer_dni: order.customer_dni || '',
        zone: order.zone || 'lima',
        city: order.city || '',
        address: order.address || '',
        products: productsSummary,
        balance: balance,
        seller: order.assigned_seller || 'Vendedora 1',
      };

      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      });

      setSyncStatus(`✓ ${order.order_number} sincronizado en Sheets`);
      setTimeout(() => setSyncStatus(''), 3500);
    } catch (err) {
      console.error('Error al sincronizar con Google Sheets:', err);
      setSyncStatus('⚠️ Error al enviar a Sheets');
      setTimeout(() => setSyncStatus(''), 4000);
    }
  };

  const fetchData = async () => {
    if (!session) return;
    setLoading(true);
    const [ordersRes, productsRes, settingsRes] = await Promise.all([
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('products').select('*').order('name', { ascending: true }),
      supabase.from('settings').select('value').eq('key', 'seller_count').maybeSingle()
    ]);

    if (ordersRes.data) setOrders(ordersRes.data);
    if (productsRes.data) setProducts(productsRes.data);
    if (settingsRes.data && settingsRes.data.value) {
      setSellerCount(parseInt(settingsRes.data.value) || 2);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (session) {
      fetchData();

      const channel = supabase
        .channel('realtime_dashboard_dynamic_sellers')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => fetchData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, () => fetchData())
        .subscribe();

      return () => supabase.removeChannel(channel);
    }
  }, [session]);

  // ================= FILTRADO POR FECHA =================
  const dateFilteredOrders = useMemo(() => {
    if (datePreset === 'todos') return orders;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return orders.filter((order) => {
      const orderDate = new Date(order.created_at || Date.now());

      if (datePreset === 'hoy') return orderDate >= startOfToday && orderDate <= endOfToday;
      if (datePreset === 'ayer') {
        const startOfYesterday = new Date(startOfToday);
        startOfYesterday.setDate(startOfYesterday.getDate() - 1);
        const endOfYesterday = new Date(startOfToday);
        endOfYesterday.setMilliseconds(-1);
        return orderDate >= startOfYesterday && orderDate <= endOfYesterday;
      }
      if (datePreset === '7dias') {
        const sevenDaysAgo = new Date(startOfToday);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        return orderDate >= sevenDaysAgo && orderDate <= endOfToday;
      }
      if (datePreset === 'mes') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        return orderDate >= startOfMonth && orderDate <= endOfToday;
      }
      if (datePreset === 'personalizado') {
        if (!customStart) return true;
        const [sYear, sMonth, sDay] = customStart.split('-').map(Number);
        const startDate = new Date(sYear, sMonth - 1, sDay, 0, 0, 0);

        let endDate = endOfToday;
        if (customEnd) {
          const [eYear, eMonth, eDay] = customEnd.split('-').map(Number);
          endDate = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);
        }
        return orderDate >= startDate && orderDate <= endDate;
      }
      return true;
    });
  }, [orders, datePreset, customStart, customEnd]);

  // ================= AJUSTE DE STOCK =================
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

    if (!isOldConfirmed && isNewConfirmed) {
      await adjustStock(order.items, -1);
    } else if (isOldConfirmed && !isNewConfirmed) {
      await adjustStock(order.items, 1);
    }

    const payload = { status: newStatus };
    if (newStatus === 'entregado') payload.advance_payment = parseFloat(order.total_amount) || 0;

    await supabase.from('orders').update(payload).eq('id', order.id);

    if (newStatus === 'confirmado') {
      const updatedOrder = { ...order, status: 'confirmado' };
      sendOrderToGoogleSheet(updatedOrder);
      sendTelegramNotification(updatedOrder);
    }

    fetchData();
  };

  const handleAdvanceChange = async (order, newAdvanceVal) => {
    const advance = parseFloat(newAdvanceVal) || 0;
    const wasConfirmed = ['confirmado', 'en_ruta', 'entregado'].includes(order.status);

    let newStatus = order.status;
    let shouldDeductStock = false;

    if (advance > 0 && ['atender', 'pendiente'].includes(order.status)) {
      newStatus = 'confirmado';
      shouldDeductStock = true;
    }

    if (shouldDeductStock && !wasConfirmed) await adjustStock(order.items, -1);

    await supabase.from('orders').update({
      advance_payment: advance,
      status: newStatus,
    }).eq('id', order.id);

    if (newStatus === 'confirmado') {
      const updatedOrder = { ...order, advance_payment: advance, status: 'confirmado' };
      sendOrderToGoogleSheet(updatedOrder);
      sendTelegramNotification(updatedOrder);
    }

    fetchData();
  };

  const handleBulkStatusChange = async (newStatus) => {
    if (!newStatus || selectedOrders.length === 0) return;
    const targets = orders.filter((o) => selectedOrders.includes(o.id));

    for (const order of targets) {
      const isOldConfirmed = ['confirmado', 'en_ruta', 'entregado'].includes(order.status);
      const isNewConfirmed = ['confirmado', 'en_ruta', 'entregado'].includes(newStatus);

      if (!isOldConfirmed && isNewConfirmed) await adjustStock(order.items, -1);
      else if (isOldConfirmed && !isNewConfirmed) await adjustStock(order.items, 1);

      const payload = { status: newStatus };
      if (newStatus === 'entregado') payload.advance_payment = parseFloat(order.total_amount) || 0;

      await supabase.from('orders').update(payload).eq('id', order.id);

      if (newStatus === 'confirmado') {
        const updatedOrder = { ...order, status: 'confirmado' };
        sendOrderToGoogleSheet(updatedOrder);
        sendTelegramNotification(updatedOrder);
      }
    }

    setSelectedOrders([]);
    fetchData();
  };

  const handleBulkDelete = async () => {
    if (!confirm(`¿Eliminar definitivamente los ${selectedOrders.length} pedidos seleccionados?`)) return;

    const targets = orders.filter((o) => selectedOrders.includes(o.id));
    for (const order of targets) {
      if (['confirmado', 'en_ruta', 'entregado'].includes(order.status)) {
        await adjustStock(order.items, 1);
      }
      await supabase.from('orders').delete().eq('id', order.id);
    }

    setSelectedOrders([]);
    fetchData();
  };

  const deleteOrder = async (id, orderNumber, orderStatus, orderItems) => {
    if (!confirm(`¿Eliminar definitivamente el pedido ${orderNumber}?`)) return;
    if (['confirmado', 'en_ruta', 'entregado'].includes(orderStatus)) {
      await adjustStock(orderItems, 1);
    }
    await supabase.from('orders').delete().eq('id', id);
    setSelectedOrders((prev) => prev.filter((item) => item !== id));
    fetchData();
  };

  const updateField = async (id, field, value) => {
    await supabase.from('orders').update({ [field]: value }).eq('id', id);
    fetchData();
  };

  const saveEditedOrder = async (e) => {
    e.preventDefault();
    const original = orders.find((o) => o.id === editingOrder.id);
    const advance = parseFloat(editingOrder.advance_payment) || 0;
    let targetStatus = editingOrder.status;

    if (advance > 0 && ['atender', 'pendiente'].includes(targetStatus)) {
      targetStatus = 'confirmado';
    }

    if (original && original.status !== targetStatus) {
      const isOldConf = ['confirmado', 'en_ruta', 'entregado'].includes(original.status);
      const isNewConf = ['confirmado', 'en_ruta', 'entregado'].includes(targetStatus);
      if (!isOldConf && isNewConf) await adjustStock(original.items, -1);
      if (isOldConf && !isNewConf) await adjustStock(original.items, 1);
    }

    const payload = {
      customer_name: editingOrder.customer_name,
      phone: editingOrder.phone,
      city: editingOrder.city,
      address: editingOrder.address,
      customer_dni: editingOrder.customer_dni,
      zone: editingOrder.zone,
      assigned_seller: editingOrder.assigned_seller || 'Vendedora 1',
      total_amount: parseFloat(editingOrder.total_amount) || 0,
      advance_payment: targetStatus === 'entregado'
        ? (parseFloat(editingOrder.total_amount) || 0)
        : advance,
      status: targetStatus,
    };

    await supabase.from('orders').update(payload).eq('id', editingOrder.id);

    if (targetStatus === 'confirmado') {
      const updatedOrder = { ...editingOrder, status: 'confirmado', advance_payment: advance };
      sendOrderToGoogleSheet(updatedOrder);
      sendTelegramNotification(updatedOrder);
    }

    setEditingOrder(null);
    fetchData();
  };

  // ================= INVENTARIO =================
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

  // ================= MÉTRICAS =================
  const metrics = useMemo(() => {
    const totalShopifyOrders = dateFilteredOrders.length;
    const atenderOrders = dateFilteredOrders.filter((o) => o.status === 'atender');
    const pendingOrders = dateFilteredOrders.filter((o) => o.status === 'pendiente');
    const confirmedOrders = dateFilteredOrders.filter((o) => ['confirmado', 'en_ruta', 'entregado'].includes(o.status));
    const inTransitOrders = dateFilteredOrders.filter((o) => ['confirmado', 'en_ruta'].includes(o.status));
    const deliveredOrders = dateFilteredOrders.filter((o) => o.status === 'entregado');
    const canceledOrders = dateFilteredOrders.filter((o) => o.status === 'cancelado');

    const ordersWithAdvance = dateFilteredOrders.filter(
      (o) => (parseFloat(o.advance_payment) || 0) > 0 && o.status !== 'cancelado'
    );

    const enMesaListos = dateFilteredOrders.filter((o) => o.status === 'confirmado');
    const provOrders = dateFilteredOrders.filter((o) => o.zone !== 'lima' && o.status !== 'cancelado');
    const provConAdelanto = provOrders.filter((o) => (parseFloat(o.advance_payment) || 0) > 0);
    const provSinAdelanto = provOrders.filter((o) => (parseFloat(o.advance_payment) || 0) === 0);

    const totalAdelantosProv = provConAdelanto.reduce(
      (acc, o) => acc + (parseFloat(o.advance_payment) || 0),
      0
    );

    const adelantosRecibidos = dateFilteredOrders
      .filter((o) => o.status !== 'cancelado')
      .reduce((acc, o) => acc + (parseFloat(o.advance_payment) || 0), 0);

    const saldoEnLaCalle = inTransitOrders.reduce((acc, o) => {
      const balance = (parseFloat(o.total_amount) || 0) - (parseFloat(o.advance_payment) || 0);
      return acc + Math.max(0, balance);
    }, 0);

    const dineroLiquidado = deliveredOrders.reduce(
      (acc, o) => acc + (parseFloat(o.total_amount) || 0),
      0
    );

    const confirmedRevenue = confirmedOrders.reduce(
      (acc, o) => acc + (parseFloat(o.total_amount) || 0),
      0
    );

    const spend = parseFloat(adSpend) || 0;
    const fLima = parseFloat(fleteLima) || 0;
    const fProv = parseFloat(fleteProv) || 0;

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

    const totalShipping = confirmedOrders.reduce(
      (acc, o) => acc + (o.zone === 'lima' ? fLima : fProv),
      0
    );

    const totalInvestment = spend + totalCOGS + totalShipping;
    const netProfit = confirmedRevenue - totalInvestment;
    const marginPct = confirmedRevenue > 0 ? ((netProfit / confirmedRevenue) * 100).toFixed(1) : 0;
    const roi = totalInvestment > 0 ? ((netProfit / totalInvestment) * 100).toFixed(1) : 0;

    const closingRate = totalShopifyOrders > 0 ? ((confirmedOrders.length / totalShopifyOrders) * 100).toFixed(1) : 0;
    const cpaAds = totalShopifyOrders > 0 && spend > 0 ? (spend / totalShopifyOrders).toFixed(2) : '0.00';
    const cpaReal = confirmedOrders.length > 0 && spend > 0 ? (spend / confirmedOrders.length).toFixed(2) : '0.00';
    const roas = spend > 0 ? (confirmedRevenue / spend).toFixed(2) : '0.00';
    const aov = confirmedOrders.length > 0 ? confirmedRevenue / confirmedOrders.length : 0;

    const soldByProduct = {};
    confirmedOrders.forEach((o) => {
      if (o.items && Array.isArray(o.items)) {
        o.items.forEach((it) => {
          const title = it.title || 'Producto';
          soldByProduct[title] = (soldByProduct[title] || 0) + (parseInt(it.quantity) || 1);
        });
      }
    });

    // Conteo dinámico por cada vendedora activa
    const sellerCounts = {};
    activeSellersList.forEach((s) => {
      sellerCounts[s] = dateFilteredOrders.filter((o) => (o.assigned_seller || 'Vendedora 1') === s).length;
    });

    return {
      totalShopifyOrders,
      atenderCount: atenderOrders.length,
      pendingCount: pendingOrders.length,
      confirmedCount: confirmedOrders.length,
      deliveredCount: deliveredOrders.length,
      canceledCount: canceledOrders.length,
      inTransitCount: inTransitOrders.length,
      ordersWithAdvanceCount: ordersWithAdvance.length,
      enMesaListosCount: enMesaListos.length,
      provConAdelantoCount: provConAdelanto.length,
      provSinAdelantoCount: provSinAdelanto.length,
      totalAdelantosProv,
      adelantosRecibidos,
      saldoEnLaCalle,
      dineroLiquidado,
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
      sellerCounts,
    };
  }, [dateFilteredOrders, products, adSpend, fleteLima, fleteProv, activeSellersList]);

  // ================= FILTRADO TABLA =================
  const visibleOrders = dateFilteredOrders.filter((o) => {
    const term = search.toLowerCase();
    const matchSearch =
      (o.order_number || '').toLowerCase().includes(term) ||
      (o.customer_name || '').toLowerCase().includes(term) ||
      (o.phone || '').includes(term) ||
      (o.city || '').toLowerCase().includes(term);

    const matchStatus =
      statusFilter === 'todos'
        ? true
        : statusFilter === 'con_adelanto'
        ? (parseFloat(o.advance_payment) || 0) > 0
        : o.status === statusFilter;

    const matchZone = zoneFilter === 'todos' || o.zone === zoneFilter;

    const currentSeller = o.assigned_seller || 'Vendedora 1';
    const matchSeller = sellerFilter === 'todos' || currentSeller === sellerFilter;

    return matchSearch && matchStatus && matchZone && matchSeller;
  });

  const selectedStats = useMemo(() => {
    const targets = orders.filter((o) => selectedOrders.includes(o.id));
    const count = targets.length;
    const totalAmount = targets.reduce((acc, o) => acc + (parseFloat(o.total_amount) || 0), 0);
    const totalAdvance = targets.reduce((acc, o) => acc + (parseFloat(o.advance_payment) || 0), 0);
    const totalBalance = targets.reduce((acc, o) => {
      if (o.status === 'entregado') return acc;
      const t = parseFloat(o.total_amount) || 0;
      const a = parseFloat(o.advance_payment) || 0;
      return acc + Math.max(0, t - a);
    }, 0);

    return { count, totalAmount, totalAdvance, totalBalance };
  }, [orders, selectedOrders]);

  const handleSelectWithAdvance = () => {
    const idsWithAdvance = visibleOrders
      .filter((o) => (parseFloat(o.advance_payment) || 0) > 0)
      .map((o) => o.id);

    const allAreSelected =
      idsWithAdvance.length > 0 &&
      idsWithAdvance.every((id) => selectedOrders.includes(id));

    if (allAreSelected) {
      setSelectedOrders((prev) => prev.filter((id) => !idsWithAdvance.includes(id)));
    } else {
      setSelectedOrders((prev) => Array.from(new Set([...prev, ...idsWithAdvance])));
    }
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === visibleOrders.length && visibleOrders.length > 0) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(visibleOrders.map((o) => o.id));
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#090b0e] flex flex-col items-center justify-center text-zinc-400 font-sans">
        <div className="w-10 h-10 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-xs font-mono tracking-wider uppercase text-zinc-500">Cargando sistema seguro...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-[#090b0e] text-zinc-100 font-sans antialiased flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none"></div>
        <div className="max-w-md w-full relative z-10 space-y-6">
          <div className="bg-[#11141a]/95 backdrop-blur-xl border border-zinc-800 rounded-3xl p-7 md:p-8 shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-300">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                PERÚ COD • DASHBOARD PRIVADO
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white mt-1">Centro de Mando</h1>
              <p className="text-xs text-zinc-400">Ingresa con tu correo autorizado para gestionar ventas y caja.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {loginError && (
                <div className="bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs p-3 rounded-xl flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{loginError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  placeholder="admin@mitienda.pe"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-750 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Contraseña</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-750 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs py-3 rounded-xl transition cursor-pointer"
              >
                {isSubmittingAuth ? 'Validando...' : 'Ingresar al Dashboard →'}
              </button>
            </form>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090b0e] text-zinc-100 font-sans antialiased p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* HEADER & SYNC */}
        <header className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-black text-white tracking-tight">
                ¡Hola Carlos! Así vamos hoy 👋
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                EN VIVO
              </span>
              {syncStatus && (
                <span className="text-[11px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2.5 py-0.5 rounded-full animate-bounce">
                  {syncStatus}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-1">Monitoreo de pedidos, despachos y dinero en mano</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex bg-zinc-900/90 p-1 rounded-xl border border-zinc-800">
              <button
                onClick={() => setActiveTab('ventas')}
                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition ${
                  activeTab === 'ventas' ? 'bg-emerald-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                }`}
              >
                1. Ventas ({dateFilteredOrders.length})
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

            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="bg-zinc-900 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-400 border border-zinc-800 px-3 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            >
              <span>🔒</span>
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        {/* BARRA DE FECHAS */}
        <section className="bg-[#11141a] p-4 rounded-2xl border border-zinc-800 flex flex-col md:flex-row items-center justify-between gap-3 shadow-lg">
          <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mr-1.5">Periodo:</span>
            {[
              { id: 'hoy', label: 'Hoy' },
              { id: 'ayer', label: 'Ayer' },
              { id: '7dias', label: 'Últimos 7 días' },
              { id: 'mes', label: 'Este Mes' },
              { id: 'personalizado', label: '📅 Rango Personalizado' },
              { id: 'todos', label: 'Histórico Total' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setDatePreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  datePreset === p.id
                    ? 'bg-zinc-100 text-zinc-950 shadow-md'
                    : 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {datePreset === 'personalizado' && (
            <div className="flex items-center gap-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-700 w-full md:w-auto">
              <div className="flex items-center gap-1 text-xs">
                <span className="text-zinc-500 text-[10px] uppercase font-bold">Desde:</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-white rounded px-2 py-0.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-zinc-500 text-[10px] uppercase font-bold">Hasta:</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-white rounded px-2 py-0.5 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}
        </section>

        {/* ========================================================================= */}
        {/* SECCIÓN 1: BANDEJA DE VENTAS                                              */}
        {/* ========================================================================= */}
        {activeTab === 'ventas' && (
          <section className="space-y-4">
            
            {/* TARJETAS OPERATIVAS */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="bg-[#11141a] border-2 border-amber-500/50 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase text-amber-400 block flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                    ⚡ Por Atender
                  </span>
                  <p className="text-xs text-zinc-400 mt-0.5">Leads nuevos sin contactar</p>
                </div>
                <span className="text-3xl font-black text-amber-300 font-mono">
                  {metrics.atenderCount}
                </span>
              </div>

              <div className="bg-[#11141a] border border-blue-500/40 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-blue-400 block">📦 En Mesa (Empaque)</span>
                  <p className="text-xs text-zinc-400 mt-0.5">Confirmados listos</p>
                </div>
                <span className="text-2xl font-black text-blue-300 font-mono">
                  {metrics.enMesaListosCount}
                </span>
              </div>

              <div className="bg-[#11141a] border border-emerald-500/40 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-emerald-400 block">🚚 Provincia c/ Adelanto</span>
                  <p className="text-xs text-emerald-400/80 mt-0.5 font-mono">
                    S/ {metrics.totalAdelantosProv.toFixed(2)} cobrados
                  </p>
                </div>
                <span className="text-2xl font-black text-emerald-300 font-mono">
                  {metrics.provConAdelantoCount}
                </span>
              </div>

              <div className="bg-[#11141a] border border-zinc-800 p-3.5 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-zinc-400 block">⏳ Provincia s/ Adelanto</span>
                  <p className="text-xs text-zinc-400 mt-0.5">Esperando Yape/Plin</p>
                </div>
                <span className="text-2xl font-black text-zinc-300 font-mono">
                  {metrics.provSinAdelantoCount}
                </span>
              </div>
            </div>

            {/* BARRA FLOTANTE DE ACCIÓN MASIVA */}
            {selectedOrders.length > 0 && (
              <div className="bg-gradient-to-r from-emerald-950/95 via-[#141922] to-[#141922] border-2 border-emerald-500 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-2xl">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-xl">
                    <span className="bg-emerald-500 text-zinc-950 font-black px-2 py-0.5 rounded-full text-xs">
                      {selectedStats.count}
                    </span>
                    <span className="text-xs font-black text-white uppercase tracking-wider">
                      Seleccionados
                    </span>
                  </div>

                  <div className="text-xs font-mono text-zinc-300">
                    Total: <strong className="text-white text-sm">S/ {selectedStats.totalAmount.toFixed(2)}</strong>
                  </div>
                  <div className="text-xs font-mono text-amber-400 bg-amber-950/40 px-2.5 py-1 rounded-lg border border-amber-500/30">
                    Adelantos: <strong>S/ {selectedStats.totalAdvance.toFixed(2)}</strong>
                  </div>
                  <div className="text-xs font-mono text-emerald-400 bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/30">
                    Por Cobrar: <strong>S/ {selectedStats.totalBalance.toFixed(2)}</strong>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] text-zinc-400 font-bold uppercase">Pasar a:</span>
                  <button
                    onClick={() => handleBulkStatusChange('confirmado')}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                  >
                    Confirmados (→ Sheets & TG)
                  </button>
                  <button
                    onClick={() => handleBulkStatusChange('en_ruta')}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                  >
                    En Ruta
                  </button>
                  <button
                    onClick={() => handleBulkStatusChange('entregado')}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition border border-emerald-400 shadow"
                  >
                    Entregados (Liquidar)
                  </button>
                  <button
                    onClick={() => handleBulkStatusChange('cancelado')}
                    className="bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition"
                  >
                    Cancelados
                  </button>

                  <button
                    onClick={handleBulkDelete}
                    className="bg-zinc-800 hover:bg-rose-950 text-rose-400 font-bold text-xs px-2.5 py-1.5 rounded-lg border border-rose-900/40 ml-1"
                  >
                    🗑️ Borrar
                  </button>
                  <button
                    onClick={() => setSelectedOrders([])}
                    className="text-xs text-zinc-400 hover:text-white underline ml-1"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
            )}

            {/* FILTROS DE ESTADO Y VENDEDORAS DINÁMICAS */}
            <div className="bg-[#11141a] p-3.5 rounded-xl border border-zinc-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Equipo de Ventas ({sellerCount} Activas):</span>
                  <div className="flex flex-wrap bg-zinc-900 p-1 rounded-xl border border-zinc-800 text-xs gap-1">
                    <button
                      onClick={() => setSellerFilter('todos')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        sellerFilter === 'todos' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Todas ({dateFilteredOrders.length})
                    </button>
                    {activeSellersList.map((s) => (
                      <button
                        key={s}
                        onClick={() => setSellerFilter(s)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                          sellerFilter === s ? 'bg-indigo-600 text-white shadow' : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <span>👩‍💼</span> {s} ({metrics.sellerCounts[s] || 0})
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleSelectWithAdvance}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition flex items-center gap-1.5 shadow-sm"
                >
                  <span>✓</span> Seleccionar c/ Adelanto ({metrics.ordersWithAdvanceCount})
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: 'todos', label: 'Todos', count: dateFilteredOrders.length, color: 'hover:bg-zinc-800' },
                    { id: 'atender', label: '⚡ Atender', count: metrics.atenderCount, color: 'text-amber-400 border border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20' },
                    { id: 'con_adelanto', label: '💰 Con Adelanto', count: metrics.ordersWithAdvanceCount, color: 'text-emerald-400 border border-emerald-500/40 bg-emerald-950/20 hover:bg-emerald-900/40' },
                    { id: 'pendiente', label: 'Pendientes', count: metrics.pendingCount, color: 'text-zinc-300' },
                    { id: 'confirmado', label: 'Confirmados', count: metrics.confirmedCount, color: 'text-blue-400' },
                    { id: 'en_ruta', label: 'En Ruta', count: dateFilteredOrders.filter((o) => o.status === 'en_ruta').length, color: 'text-purple-400' },
                    { id: 'entregado', label: 'Entregados', count: metrics.deliveredCount, color: 'text-emerald-400' },
                    { id: 'cancelado', label: 'Cancelados', count: metrics.canceledCount, color: 'text-rose-400' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setStatusFilter(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-wider transition ${
                        statusFilter === tab.id
                          ? 'bg-zinc-100 text-zinc-950 shadow-md'
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
            </div>

            {/* BUSCADOR */}
            <input
              type="text"
              placeholder="Buscar por cliente, teléfono, #orden o ciudad..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#11141a] border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
            />

            {/* TABLA EN FILAS */}
            <div className="bg-[#11141a] border border-zinc-800 rounded-2xl overflow-x-auto shadow-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={visibleOrders.length > 0 && selectedOrders.length === visibleOrders.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                      />
                    </th>
                    <th className="py-3.5 px-3">#Orden</th>
                    <th className="py-3.5 px-3">Vendedora</th>
                    <th className="py-3.5 px-3">Fecha</th>
                    <th className="py-3.5 px-3">Cliente</th>
                    <th className="py-3.5 px-3">Destino / Zona</th>
                    <th className="py-3.5 px-3">Productos</th>
                    <th className="py-3.5 px-3 text-right">Total</th>
                    <th className="py-3.5 px-3 text-right">Adelanto</th>
                    <th className="py-3.5 px-3 text-right">Saldo Restante</th>
                    <th className="py-3.5 px-3">Estado</th>
                    <th className="py-3.5 px-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {loading ? (
                    <tr>
                      <td colSpan="12" className="py-8 text-center text-zinc-500">Cargando despachos...</td>
                    </tr>
                  ) : visibleOrders.length === 0 ? (
                    <tr>
                      <td colSpan="12" className="py-8 text-center text-zinc-500">No hay pedidos con este filtro.</td>
                    </tr>
                  ) : (
                    visibleOrders.map((order) => {
                      const total = parseFloat(order.total_amount || 0);
                      const advance = parseFloat(order.advance_payment || 0);
                      const balance = Math.max(0, total - advance);
                      const isDelivered = order.status === 'entregado';
                      const cleanPhone = (order.phone || '').replace(/\D/g, '');

                      const dateObj = new Date(order.created_at || Date.now());
                      const dateStr = dateObj.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
                      const timeStr = dateObj.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

                      let waMessage = '';
                      if (order.status === 'cancelado') {
                        waMessage = `Hola ${order.customer_name}, te saludamos de la tienda respecto a tu pedido ${order.order_number}. Vimos que no se pudo concretar. ¿Deseas reprogramarlo con una facilidad de despacho? Quedamos atentos para ayudarte.`;
                      } else if (order.zone === 'lima') {
                        waMessage = `Hola ${order.customer_name}, te saludamos para coordinar la entrega de tu pedido ${order.order_number} por S/ ${balance.toFixed(2)}. El despacho es a tu domicilio (${order.address}, ${order.city}) con motorizado contraentrega. ¿Me confirmas si estás disponible hoy?`;
                      } else {
                        waMessage = `Hola ${order.customer_name}, te saludamos para coordinar el envío de tu pedido ${order.order_number} a ${order.city} por Shalom contraentrega por S/ ${balance.toFixed(2)}. ¿Me confirmas tu DNI${order.customer_dni ? ` (${order.customer_dni})` : ''} y tu agencia Shalom de retiro?`;
                      }

                      const waUrl = `https://wa.me/51${cleanPhone}?text=${encodeURIComponent(waMessage)}`;
                      const sellerName = order.assigned_seller || 'Vendedora 1';

                      return (
                        <tr
                          key={order.id}
                          className={`hover:bg-zinc-900/40 transition ${
                            selectedOrders.includes(order.id) ? 'bg-emerald-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedOrders.includes(order.id)}
                              onChange={() => toggleSelectOne(order.id)}
                              className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                            />
                          </td>

                          <td className="py-3 px-3 font-mono font-bold text-white whitespace-nowrap">
                            {order.order_number}
                          </td>

                          {/* SELECTOR DINÁMICO DE VENDEDORAS */}
                          <td className="py-3 px-3 whitespace-nowrap">
                            <select
                              value={sellerName}
                              onChange={(e) => updateField(order.id, 'assigned_seller', e.target.value)}
                              className="text-[10px] font-bold rounded-lg px-2 py-1 border bg-zinc-900 text-zinc-200 border-zinc-700 cursor-pointer focus:outline-none"
                            >
                              {activeSellersList.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3 px-3 font-mono text-[11px] text-zinc-400 whitespace-nowrap">
                            <div>{dateStr}</div>
                            <div className="text-[10px] text-zinc-500">{timeStr}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-bold text-white leading-snug">{order.customer_name}</div>
                            <div className="text-[11px] text-zinc-400 font-mono">{order.phone}</div>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                order.zone === 'lima' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              }`}>
                                {order.zone}
                              </span>
                              <span className="text-zinc-300 truncate max-w-[130px]">{order.city}</span>
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate max-w-[170px]">{order.address}</div>
                          </td>
                          <td className="py-3 px-3">
                            {order.items && Array.isArray(order.items) ? (
                              <div className="text-[11px] text-zinc-300 space-y-0.5 max-w-[190px]">
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
                          <td className="py-3 px-3 text-right font-mono text-zinc-300">
                            S/ {total.toFixed(2)}
                          </td>

                          {/* ADELANTO INLINE */}
                          <td className="py-3 px-3 text-right font-mono">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-amber-500 text-[10px] font-bold">S/</span>
                              <input
                                type="number"
                                key={order.advance_payment}
                                defaultValue={order.advance_payment || 0}
                                onBlur={(e) => handleAdvanceChange(order, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.target.blur();
                                }}
                                className="w-16 bg-zinc-900 border border-zinc-700 hover:border-amber-500/50 focus:border-amber-400 text-amber-300 font-bold rounded px-1.5 py-0.5 text-right text-xs focus:outline-none transition"
                              />
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-bold whitespace-nowrap">
                            {isDelivered ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                ✓ S/ 0.00 (Liquidado)
                              </span>
                            ) : (
                              <span className="text-emerald-400">
                                S/ {balance.toFixed(2)}
                              </span>
                            )}
                          </td>

                          {/* ESTADO */}
                          <td className="py-3 px-3">
                            <select
                              value={order.status || 'atender'}
                              onChange={(e) => updateOrderStatus(order, e.target.value)}
                              className={`text-[11px] font-bold rounded-lg px-2 py-1 border focus:outline-none cursor-pointer ${
                                order.status === 'atender'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 animate-pulse'
                                  : order.status === 'confirmado'
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
                              <option value="atender">⚡ Atender</option>
                              <option value="pendiente">Pendiente</option>
                              <option value="confirmado">Confirmado</option>
                              <option value="en_ruta">En ruta</option>
                              <option value="entregado">Entregado (Liquidar)</option>
                              <option value="cancelado">Cancelado</option>
                            </select>
                          </td>

                          <td className="py-3 px-3">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => sendOrderToGoogleSheet(order)}
                                title="Enviar a Google Sheets"
                                className="bg-emerald-950/60 hover:bg-emerald-900 text-emerald-400 p-1 rounded text-xs border border-emerald-500/40 transition"
                              >
                                📊
                              </button>
                              <button
                                onClick={() => sendTelegramNotification(order)}
                                title="Enviar alerta a Telegram"
                                className="bg-blue-950/60 hover:bg-blue-900 text-blue-400 p-1 rounded text-xs border border-blue-500/40 transition"
                              >
                                🤖
                              </button>
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="WhatsApp"
                                className={`px-2 py-1 rounded text-[11px] font-bold text-white transition ${
                                  order.status === 'cancelado' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                                }`}
                              >
                                WA
                              </a>
                              <button
                                onClick={() => setEditingOrder(order)}
                                title="Editar"
                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 p-1 rounded text-xs"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => deleteOrder(order.id, order.order_number, order.status, order.items)}
                                title="Eliminar"
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
        {/* SECCIÓN 2: LOGÍSTICA & STOCK + CONFIGURACIÓN DE VENDEDORAS                */}
        {/* ========================================================================= */}
        {activeTab === 'logistica' && (
          <section className="space-y-6">
            
            {/* CONFIGURACIÓN DE VENDEDORAS (ROUND-ROBIN ESCALABLE) */}
            <div className="bg-[#11141a] p-5 rounded-2xl border border-indigo-500/40 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👩‍💼</span>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Gestión de Equipo de Ventas (Round-Robin Dinámico)</h3>
                </div>
                <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 px-2.5 py-0.5 rounded-full">
                  {sellerCount} VENDEDORAS ACTIVAS
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Selecciona cuántas vendedoras tienes trabajando. El webhook de Shopify distribuirá automáticamente los pedidos nuevos en partes iguales (1/N).
              </p>
              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs text-zinc-300 font-bold">Número de vendedoras:</label>
                <select
                  value={sellerCount}
                  onChange={(e) => handleSellerCountChange(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 text-white rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="1">1 Vendedora</option>
                  <option value="2">2 Vendedoras</option>
                  <option value="3">3 Vendedoras</option>
                  <option value="4">4 Vendedoras</option>
                  <option value="5">5 Vendedoras</option>
                </select>
                <span className="text-[11px] text-zinc-500">Se generarán: {activeSellersList.join(', ')}</span>
              </div>
            </div>

            {/* GOOGLE SHEETS & TELEGRAM CONFIG */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              <div className="bg-[#11141a] p-5 rounded-2xl border border-emerald-500/40 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">📊</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Google Sheets (Empaque)</h3>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                    AUTOSYNC
                  </span>
                </div>
                <p className="text-xs text-zinc-400">URL del Apps Script para enviar pedidos confirmados.</p>
                <input
                  type="text"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  value={sheetWebhookUrl}
                  onChange={(e) => saveConfig('cod_sheet_url', e.target.value, setSheetWebhookUrl)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="bg-[#11141a] p-5 rounded-2xl border border-blue-500/40 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🤖</span>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">Telegram Bot (Alertas)</h3>
                  </div>
                  <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2.5 py-0.5 rounded-full">
                    CONFIGURAR
                  </span>
                </div>
                <p className="text-xs text-zinc-400">Pega aquí tu Token de BotFather y tu Chat ID personal.</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Bot Token"
                    value={tgToken}
                    onChange={(e) => saveConfig('cod_tg_token', e.target.value, setTgToken)}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-blue-300 font-mono focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Chat ID"
                    value={tgChatId}
                    onChange={(e) => saveConfig('cod_tg_chatid', e.target.value, setTgChatId)}
                    className="bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-blue-300 font-mono focus:outline-none"
                  />
                </div>
              </div>

            </div>

            {/* INVENTARIO */}
            <div className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-zinc-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Inventario Físico & Costo de Compra</h3>
                  <p className="text-xs text-zinc-400">El stock se resta al Confirmar y se devuelve si se Cancela o Elimina.</p>
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
                  <p className="text-xs text-zinc-500">No hay productos registrados en el inventario.</p>
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
                {dateFilteredOrders
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
                            <option value="entregado">Entregado (Liquidar)</option>
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
        {/* SECCIÓN 3: MÉTRICAS REALES Y FINANZAS                                     */}
        {/* ========================================================================= */}
        {activeTab === 'metricas' && (
          <section className="space-y-6">
            <div className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 space-y-3">
              <h3 className="text-xs font-bold uppercase text-zinc-400 tracking-wider">Configuración Financiera del Periodo</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <label className="block text-[10px] uppercase font-bold text-zinc-400">Gasto en Anuncios (Ads)</label>
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

            {/* FLUJO DE CAJA & LIQUIDACIÓN */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#11141a] border border-amber-500/40 p-5 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-amber-400 block">Adelantos Recibidos (Yape / Plin)</span>
                <span className="text-3xl font-black text-amber-300 font-mono block mt-1">
                  S/ {metrics.adelantosRecibidos.toFixed(2)}
                </span>
                <p className="text-[11px] text-zinc-400 mt-1">Cobros adelantados ya seguros en cuenta</p>
              </div>

              <div className="bg-[#11141a] border border-blue-500/40 p-5 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-blue-400 block">Saldo en la Calle (Por Cobrar)</span>
                <span className="text-3xl font-black text-blue-300 font-mono block mt-1">
                  S/ {metrics.saldoEnLaCalle.toFixed(2)}
                </span>
                <p className="text-[11px] text-zinc-400 mt-1">En manos de motorizado y agencias ({metrics.inTransitCount} pedidos)</p>
              </div>

              <div className="bg-[#11141a] border border-emerald-500/40 p-5 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-emerald-400 block">Dinero Liquidado (Entregado)</span>
                <span className="text-3xl font-black text-emerald-300 font-mono block mt-1">
                  S/ {metrics.dineroLiquidado.toFixed(2)}
                </span>
                <p className="text-[11px] text-zinc-400 mt-1">Total cerrado de entregas ({metrics.deliveredCount} pedidos)</p>
              </div>
            </div>

            {/* LAS 8 MÉTRICAS OPERATIVAS */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-[#11141a] border border-zinc-800 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">Pedidos Shopify (Entrantes)</span>
                <span className="text-3xl font-black text-white font-mono block mt-1">
                  {metrics.totalShopifyOrders}
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Clientes formulario periodo</p>
              </div>

              <div className="bg-[#11141a] border border-blue-500/40 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-blue-400 block">Confirmados & % Cierre</span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-black text-blue-300 font-mono">{metrics.confirmedCount}</span>
                  <span className="text-sm font-bold text-zinc-400 font-mono">({metrics.closingRate}%)</span>
                </div>
                <p className="text-[11px] text-zinc-500 mt-1">Tasa de confirmación</p>
              </div>

              <div className="bg-[#11141a] border border-zinc-800 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">CPA Ads (Bruto Shopify)</span>
                <span className="text-3xl font-black text-zinc-200 font-mono block mt-1">
                  S/ {metrics.cpaAds}
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Gasto Ads / Total Pedidos</p>
              </div>

              <div className="bg-[#11141a] border border-amber-500/50 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-amber-400 block">CPA Real (Efectivo)</span>
                <span className="text-3xl font-black text-amber-300 font-mono block mt-1">
                  S/ {metrics.cpaReal}
                </span>
                <p className="text-[11px] text-amber-400/80 mt-1">Gasto Ads / Confirmados</p>
              </div>

              <div className="bg-gradient-to-br from-emerald-950/60 via-[#11141a] to-[#11141a] border-2 border-emerald-500/50 p-4 rounded-2xl">
                <span className="text-[10px] font-black uppercase text-emerald-400 block">Ganancia Real Líquida</span>
                <span className="text-3xl font-black text-emerald-300 font-mono block mt-1">
                  S/ {metrics.netProfit.toFixed(2)}
                </span>
                <p className="text-[11px] text-emerald-400 mt-1">Limpio tras COGS, Flete y Ads</p>
              </div>

              <div className="bg-[#11141a] border border-emerald-500/30 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-emerald-400 block">% Margen Neto</span>
                <span className="text-3xl font-black text-emerald-300 font-mono block mt-1">
                  {metrics.marginPct}%
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Utilidad / Facturación</p>
              </div>

              <div className="bg-[#11141a] border border-zinc-800 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-blue-400 block">ROAS Real</span>
                <span className="text-3xl font-black text-blue-300 font-mono block mt-1">
                  {metrics.roas}x
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Facturación / Gasto Ads</p>
              </div>

              <div className="bg-[#11141a] border border-purple-500/40 p-4 rounded-2xl">
                <span className="text-[10px] font-bold uppercase text-purple-400 block">ROI (%) Inversión Total</span>
                <span className="text-3xl font-black text-purple-300 font-mono block mt-1">
                  {metrics.roi}%
                </span>
                <p className="text-[11px] text-zinc-500 mt-1">Retorno sobre Ads + Stock + Fletes</p>
              </div>
            </div>

            {/* RESUMEN DE STOCK VENDIDO */}
            <div className="bg-[#11141a] p-5 rounded-2xl border border-zinc-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                Stock Vendido en este Periodo
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {Object.keys(metrics.soldByProduct).length === 0 ? (
                  <p className="text-xs text-zinc-500">No hay productos vendidos en pedidos confirmados durante este periodo.</p>
                ) : (
                  Object.entries(metrics.soldByProduct).map(([prodName, qty]) => {
                    const matched = products.find((p) => (p.name || '').toLowerCase().trim() === prodName.toLowerCase().trim());
                    const currentStock = matched ? matched.stock : 'N/A';

                    return (
                      <div key={prodName} className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex justify-between items-center">
                        <div>
                          <h4 className="font-bold text-white text-xs">{prodName}</h4>
                          <span className="text-[11px] text-zinc-400 mt-0.5 block">
                            Stock Disponible en Almacén: <strong className="text-white font-mono">{currentStock}</strong>
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

        {/* MODAL PARA EDITAR PEDIDO */}
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
                  <label className="block text-zinc-400 mb-1">Vendedora Asignada</label>
                  <select
                    value={editingOrder.assigned_seller || 'Vendedora 1'}
                    onChange={(e) => setEditingOrder({ ...editingOrder, assigned_seller: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white"
                  >
                    {activeSellersList.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Adelanto (S/)</label>
                  <input
                    type="number"
                    value={editingOrder.advance_payment}
                    onChange={(e) => {
                      const val = e.target.value;
                      const num = parseFloat(val) || 0;
                      setEditingOrder({
                        ...editingOrder,
                        advance_payment: val,
                        status: num > 0 && ['atender', 'pendiente'].includes(editingOrder.status) ? 'confirmado' : editingOrder.status,
                      });
                    }}
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
