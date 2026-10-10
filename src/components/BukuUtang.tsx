import React, { useState, useMemo, useEffect } from 'react';
import { 
  Search, 
  Plus, 
  ArrowLeft, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Phone, 
  Calendar, 
  Share2, 
  Printer, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  User, 
  X, 
  ChevronRight, 
  MessageSquare,
  Edit3,
  Coins,
  RefreshCw
} from 'lucide-react';
import { EscPosEncoder } from '../utils/escpos';
import { db } from '../db/db';
import { auth, saveDebtToFirestore, updateDebtInFirestore, deleteDebtFromFirestore } from '../services/firebase';
import { CustomerDebt, DebtPayment, DebtMutation, StoreSettings } from '../types';

interface BukuUtangProps {
  debts: CustomerDebt[];
  onRefresh: () => void;
  settings: StoreSettings;
  storeId?: string | null;
  sounds: {
    playScanBeep: () => void;
    playSuccess: () => void;
  };
}

export const BukuUtang: React.FC<BukuUtangProps> = ({
  debts,
  onRefresh,
  settings,
  storeId,
  sounds
}) => {
  // Navigation State: null = List View, object = Detail Ledger View
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | number | null>(null);

  // Tab: 'pelanggan' (Utang Pelanggan / Piutang) vs 'saya' (Utang Saya)
  const [activeCategory, setActiveCategory] = useState<'pelanggan' | 'saya'>('pelanggan');

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'due' | 'paid'>('all');

  // Modals
  const [isNewDebtModalOpen, setIsNewDebtModalOpen] = useState(false);
  const [isGiveModalOpen, setIsGiveModalOpen] = useState(false); // "Berikan" (Tambah Utang)
  const [isTakeModalOpen, setIsTakeModalOpen] = useState(false); // "Terima" (Bayar/Cicil)
  const [isDueDateModalOpen, setIsDueDateModalOpen] = useState(false);
  const [isPayoffModalOpen, setIsPayoffModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [mutationToDelete, setMutationToDelete] = useState<DebtMutation | null>(null);

  // Form States for "Catat Utang Baru"
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formDueDate, setFormDueDate] = useState('');
  const [formCategory, setFormCategory] = useState<'pelanggan' | 'saya'>('pelanggan');

  // Form States for "Berikan" (Add Debt on selected customer)
  const [giveAmount, setGiveAmount] = useState('');
  const [giveNote, setGiveNote] = useState('');
  const [giveDate, setGiveDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [giveDueDate, setGiveDueDate] = useState('');

  // Form States for "Terima" (Record Payment on selected customer)
  const [takeAmount, setTakeAmount] = useState('');
  const [takeNote, setTakeNote] = useState('');
  const [takeDate, setTakeDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Form State for Due Date
  const [tempDueDate, setTempDueDate] = useState('');

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatRupiah = (num: number) => {
    return Math.round(num || 0).toLocaleString('id-ID');
  };

  // Find currently selected customer
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return debts.find(d => (d.id === selectedCustomerId || d.firestoreId === selectedCustomerId)) || null;
  }, [debts, selectedCustomerId]);

  // Generate color hash for avatar
  const getAvatarColor = (name: string) => {
    const colors = [
      'from-rose-500 to-pink-600',
      'from-emerald-500 to-teal-600',
      'from-amber-500 to-orange-600',
      'from-sky-500 to-blue-600',
      'from-indigo-500 to-violet-600',
      'from-purple-500 to-fuchsia-600',
      'from-teal-500 to-emerald-600',
      'from-cyan-500 to-blue-600'
    ];
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  };

  const getInitials = (name: string) => {
    if (!name) return 'PL';
    const parts = name.trim().split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Metrics: Utang Pelanggan vs Utang Saya
  const metrics = useMemo(() => {
    let totalUtangPelanggan = 0;
    let countPelangganUnpaid = 0;
    let totalUtangSaya = 0;
    let countSayaUnpaid = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    debts.forEach(d => {
      const isSaya = d.debtCategory === 'saya';
      const rem = d.remainingAmount || 0;

      if (isSaya) {
        if (rem > 0) {
          totalUtangSaya += rem;
          countSayaUnpaid++;
        }
      } else {
        if (rem > 0) {
          totalUtangPelanggan += rem;
          countPelangganUnpaid++;
        }
      }
    });

    return {
      totalUtangPelanggan,
      countPelangganUnpaid,
      totalUtangSaya,
      countSayaUnpaid,
      todayStr
    };
  }, [debts]);

  // Filtered debts for the list view
  const filteredDebts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const today = new Date().toISOString().split('T')[0];

    return debts
      .filter(d => {
        // Match Category (pelanggan vs saya)
        const isSaya = d.debtCategory === 'saya';
        if (activeCategory === 'saya' && !isSaya) return false;
        if (activeCategory === 'pelanggan' && isSaya) return false;

        // Match Search
        if (q) {
          const matchName = (d.customerName || '').toLowerCase().includes(q);
          const matchPhone = (d.customerPhone || '').toLowerCase().includes(q);
          const matchDesc = (d.description || '').toLowerCase().includes(q);
          if (!matchName && !matchPhone && !matchDesc) return false;
        }

        // Match Status Filter
        if (statusFilter === 'unpaid') {
          return (d.remainingAmount || 0) > 0;
        }
        if (statusFilter === 'paid') {
          return (d.remainingAmount || 0) === 0;
        }
        if (statusFilter === 'due') {
          return (d.remainingAmount || 0) > 0 && !!d.dueDate && d.dueDate <= today;
        }

        return true;
      })
      .sort((a, b) => {
        // Sort unpaid first, then by last updated
        const aUnpaid = (a.remainingAmount || 0) > 0 ? 1 : 0;
        const bUnpaid = (b.remainingAmount || 0) > 0 ? 1 : 0;
        if (bUnpaid !== aUnpaid) return bUnpaid - aUnpaid;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
  }, [debts, activeCategory, searchQuery, statusFilter]);

  // Synthesize or normalize mutations list for selected customer
  const customerMutations = useMemo((): DebtMutation[] => {
    if (!selectedCustomer) return [];

    if (selectedCustomer.mutations && selectedCustomer.mutations.length > 0) {
      return [...selectedCustomer.mutations].sort((a, b) => b.timestamp - a.timestamp);
    }

    // Otherwise reconstruct from initial debt + payments
    const list: DebtMutation[] = [];

    // Initial Give
    list.push({
      id: 'init-' + (selectedCustomer.id || selectedCustomer.createdAt),
      type: 'give',
      amount: selectedCustomer.totalAmount || 0,
      note: selectedCustomer.description || 'Pencatatan Utang Awal',
      timestamp: selectedCustomer.createdAt || Date.now(),
      dateString: new Date(selectedCustomer.createdAt || Date.now()).toISOString().split('T')[0]
    });

    // Each payment as Take
    if (selectedCustomer.payments && selectedCustomer.payments.length > 0) {
      selectedCustomer.payments.forEach((p, idx) => {
        list.push({
          id: p.id || 'pay-' + idx,
          type: 'take',
          amount: p.amount,
          note: p.note || 'Pembayaran / Cicilan',
          timestamp: p.timestamp || Date.now(),
          dateString: new Date(p.timestamp || Date.now()).toISOString().split('T')[0]
        });
      });
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }, [selectedCustomer]);

  // Handle Save New Customer Debt
  const handleSaveNewDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formCustomerName.trim();
    const amt = parseFloat(formAmount) || 0;

    if (!name) {
      alert('Nama pelanggan harus diisi');
      return;
    }
    if (amt <= 0) {
      alert('Nominal utang harus lebih dari 0');
      return;
    }

    const debtDate = formDate || new Date().toISOString().split('T')[0];
    const debtTimestamp = new Date(debtDate).getTime() || Date.now();

    const initialMutation: DebtMutation = {
      id: 'mut-' + Date.now(),
      type: 'give',
      amount: amt,
      note: formDescription.trim() || 'Bon Belanja',
      timestamp: debtTimestamp,
      dateString: debtDate
    };

    const newDebt: CustomerDebt = {
      customerName: name,
      customerPhone: formCustomerPhone.trim() || undefined,
      description: formDescription.trim() || 'Bon Belanja',
      totalAmount: amt,
      paidAmount: 0,
      remainingAmount: amt,
      status: 'belum_lunas',
      debtCategory: formCategory,
      dueDate: formDueDate || undefined,
      createdAt: debtTimestamp,
      updatedAt: Date.now(),
      payments: [],
      mutations: [initialMutation],
      storeId: storeId || undefined
    };

    try {
      const localId = await db.debts.add(newDebt);
      newDebt.id = localId;

      if (auth.currentUser) {
        const firestoreId = await saveDebtToFirestore(newDebt, storeId || undefined);
        await db.debts.update(localId, { firestoreId });
        newDebt.firestoreId = firestoreId;
      }

      sounds.playSuccess();
      showToast(`✓ Catatan utang "${name}" sebesar Rp ${formatRupiah(amt)} berhasil disimpan!`);
      
      // Reset form
      setFormCustomerName('');
      setFormCustomerPhone('');
      setFormAmount('');
      setFormDescription('');
      setFormDueDate('');
      setFormDate(new Date().toISOString().split('T')[0]);
      setIsNewDebtModalOpen(false);

      onRefresh();
      setSelectedCustomerId(localId);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan: ' + err.message);
    }
  };

  // Handle "Berikan" (Tambah Utang ke Pelanggan yang sedang dibuka)
  const handleSaveGive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amt = parseFloat(giveAmount) || 0;
    if (amt <= 0) {
      alert('Nominal yang diberikan harus lebih dari 0');
      return;
    }

    const ts = giveDate ? new Date(giveDate).getTime() : Date.now();
    const newMutation: DebtMutation = {
      id: 'mut-' + Date.now(),
      type: 'give',
      amount: amt,
      note: giveNote.trim() || 'Tambah Bon',
      timestamp: ts,
      dateString: giveDate || new Date().toISOString().split('T')[0]
    };

    const existingMutations = customerMutations;
    const updatedMutations = [newMutation, ...existingMutations];

    const newTotal = (selectedCustomer.totalAmount || 0) + amt;
    const currentPaid = selectedCustomer.paidAmount || 0;
    const newRemaining = Math.max(0, newTotal - currentPaid);
    const newStatus: 'belum_lunas' | 'cicilan' | 'lunas' = newRemaining === 0 ? 'lunas' : (currentPaid > 0 ? 'cicilan' : 'belum_lunas');

    const desc = selectedCustomer.description ? `${selectedCustomer.description} + ${giveNote.trim() || 'Tambah Bon'}` : (giveNote.trim() || 'Tambah Bon');

    const updatePayload: Partial<CustomerDebt> = {
      totalAmount: newTotal,
      remainingAmount: newRemaining,
      status: newStatus,
      description: desc,
      mutations: updatedMutations,
      updatedAt: Date.now()
    };

    if (giveDueDate) {
      updatePayload.dueDate = giveDueDate;
    }

    try {
      if (selectedCustomer.id) {
        await db.debts.update(selectedCustomer.id, updatePayload);
      }
      if (auth.currentUser) {
        await updateDebtInFirestore(
          selectedCustomer.firestoreId || selectedCustomer.id,
          updatePayload,
          selectedCustomer.createdAt
        );
      }

      sounds.playSuccess();
      showToast(`✓ Berhasil mencatat utang tambahan Rp ${formatRupiah(amt)} untuk ${selectedCustomer.customerName}`);
      setGiveAmount('');
      setGiveNote('');
      setGiveDueDate('');
      setIsGiveModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal mencatat mutasi: ' + err.message);
    }
  };

  // Handle "Terima" (Catat Pembayaran / Cicilan dari Pelanggan)
  const handleSaveTake = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;

    const amt = parseFloat(takeAmount) || 0;
    if (amt <= 0) {
      alert('Nominal yang diterima harus lebih dari 0');
      return;
    }

    const ts = takeDate ? new Date(takeDate).getTime() : Date.now();
    const newMutation: DebtMutation = {
      id: 'mut-' + Date.now(),
      type: 'take',
      amount: amt,
      note: takeNote.trim() || 'Pembayaran Cicilan',
      timestamp: ts,
      dateString: takeDate || new Date().toISOString().split('T')[0]
    };

    const newPayment: DebtPayment = {
      id: 'dp-' + Date.now(),
      amount: amt,
      timestamp: ts,
      note: takeNote.trim() || 'Pembayaran Cicilan'
    };

    const existingMutations = customerMutations;
    const updatedMutations = [newMutation, ...existingMutations];
    const updatedPayments = [...(selectedCustomer.payments || []), newPayment];

    const currentTotal = selectedCustomer.totalAmount || 0;
    const newPaid = (selectedCustomer.paidAmount || 0) + amt;
    const newRemaining = Math.max(0, currentTotal - newPaid);
    const newStatus: 'belum_lunas' | 'cicilan' | 'lunas' = newRemaining === 0 ? 'lunas' : 'cicilan';

    const updatePayload: Partial<CustomerDebt> = {
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status: newStatus,
      payments: updatedPayments,
      mutations: updatedMutations,
      updatedAt: Date.now()
    };

    try {
      if (selectedCustomer.id) {
        await db.debts.update(selectedCustomer.id, updatePayload);
      }
      if (auth.currentUser) {
        await updateDebtInFirestore(
          selectedCustomer.firestoreId || selectedCustomer.id,
          updatePayload,
          selectedCustomer.createdAt
        );
      }

      sounds.playSuccess();
      showToast(`✓ Pembayaran diterima Rp ${formatRupiah(amt)} dari ${selectedCustomer.customerName}`);
      setTakeAmount('');
      setTakeNote('');
      setIsTakeModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal mencatat pembayaran: ' + err.message);
    }
  };

  // Handle Quick Payoff ("Lunaskan")
  const handleExecutePayoff = async () => {
    if (!selectedCustomer) return;
    const remaining = selectedCustomer.remainingAmount;
    if (remaining <= 0) {
      showToast('Utang pelanggan ini sudah lunas!');
      setIsPayoffModalOpen(false);
      return;
    }

    const ts = Date.now();
    const newMutation: DebtMutation = {
      id: 'mut-' + ts,
      type: 'take',
      amount: remaining,
      note: 'Pelunasan Total Utang',
      timestamp: ts,
      dateString: new Date().toISOString().split('T')[0]
    };

    const newPayment: DebtPayment = {
      id: 'dp-' + ts,
      amount: remaining,
      timestamp: ts,
      note: 'Pelunasan Total'
    };

    const updatedMutations = [newMutation, ...customerMutations];
    const updatedPayments = [...(selectedCustomer.payments || []), newPayment];

    const updatePayload: Partial<CustomerDebt> = {
      paidAmount: selectedCustomer.totalAmount,
      remainingAmount: 0,
      status: 'lunas',
      payments: updatedPayments,
      mutations: updatedMutations,
      updatedAt: ts
    };

    try {
      if (selectedCustomer.id) {
        await db.debts.update(selectedCustomer.id, updatePayload);
      }
      if (auth.currentUser) {
        await updateDebtInFirestore(
          selectedCustomer.firestoreId || selectedCustomer.id,
          updatePayload,
          selectedCustomer.createdAt
        );
      }

      sounds.playSuccess();
      showToast(`✓ Utang ${selectedCustomer.customerName} sebesar Rp ${formatRupiah(remaining)} telah LUNAS!`);
      setIsPayoffModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal melunasi: ' + err.message);
    }
  };

  // Handle Set Due Date
  const handleSaveDueDate = async () => {
    if (!selectedCustomer) return;
    try {
      const updatePayload: Partial<CustomerDebt> = {
        dueDate: tempDueDate || undefined,
        updatedAt: Date.now()
      };
      if (selectedCustomer.id) {
        await db.debts.update(selectedCustomer.id, updatePayload);
      }
      if (auth.currentUser) {
        await updateDebtInFirestore(
          selectedCustomer.firestoreId || selectedCustomer.id,
          updatePayload,
          selectedCustomer.createdAt
        );
      }
      sounds.playSuccess();
      showToast(tempDueDate ? `✓ Tanggal jatuh tempo diatur ke ${tempDueDate}` : '✓ Tanggal jatuh tempo dihapus');
      setIsDueDateModalOpen(false);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal mengatur jatuh tempo: ' + err.message);
    }
  };

  // Handle Delete Mutation Row
  const handleDeleteMutation = (mutId: string) => {
    if (!selectedCustomer) return;
    const targetMut = customerMutations.find(m => m.id === mutId);
    if (!targetMut) return;
    setMutationToDelete(targetMut);
  };

  const executeDeleteMutation = async (mutId: string) => {
    if (!selectedCustomer) return;
    const updatedMutations = customerMutations.filter(m => m.id !== mutId);
    
    // Recalculate totals
    let newTotal = 0;
    let newPaid = 0;
    updatedMutations.forEach(m => {
      if (m.type === 'give') newTotal += m.amount;
      if (m.type === 'take') newPaid += m.amount;
    });

    const newRemaining = Math.max(0, newTotal - newPaid);
    const newStatus: 'belum_lunas' | 'cicilan' | 'lunas' = newRemaining === 0 ? 'lunas' : (newPaid > 0 ? 'cicilan' : 'belum_lunas');

    const updatePayload: Partial<CustomerDebt> = {
      totalAmount: newTotal,
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status: newStatus,
      mutations: updatedMutations,
      updatedAt: Date.now()
    };

    try {
      if (selectedCustomer.id) {
        await db.debts.update(selectedCustomer.id, updatePayload);
      }
      if (auth.currentUser) {
        await updateDebtInFirestore(
          selectedCustomer.firestoreId || selectedCustomer.id,
          updatePayload,
          selectedCustomer.createdAt
        );
      }
      sounds.playScanBeep();
      showToast('✓ Catatan transaksi berhasil dihapus');
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal menghapus mutasi: ' + err.message);
    }
  };

  // Handle Delete Entire Customer
  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;
    try {
      if (selectedCustomer.id) {
        await db.debts.delete(selectedCustomer.id);
      }
      if (auth.currentUser) {
        await deleteDebtFromFirestore(selectedCustomer);
      }
      sounds.playScanBeep();
      showToast(`✓ Catatan buku utang untuk "${selectedCustomer.customerName}" telah dihapus.`);
      setIsDeleteModalOpen(false);
      setSelectedCustomerId(null);
      onRefresh();
    } catch (err: any) {
      console.error(err);
      alert('Gagal menghapus pelanggan: ' + err.message);
    }
  };

  // WhatsApp reminder message template
  const handleSendWhatsAppReminder = () => {
    if (!selectedCustomer) return;
    const phone = (selectedCustomer.customerPhone || '').replace(/[^0-9]/g, '');
    const cleanPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone;

    const store = settings.storeName || 'Cool Kids Cell';
    const dueInfo = selectedCustomer.dueDate ? ` yang jatuh tempo pada ${new Date(selectedCustomer.dueDate).toLocaleDateString('id-ID')}` : '';

    const message = `Halo Kak ${selectedCustomer.customerName},\n\nMengingatkan catatan tagihan bon belanja di *${store}* sebesar *Rp ${formatRupiah(selectedCustomer.remainingAmount)}*${dueInfo}.\n\nBisa dibayarkan langsung ke kasir toko atau transfer ya. Terima kasih banyak! 🙏`;

    const encoded = encodeURIComponent(message);
    const waUrl = cleanPhone 
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(waUrl, '_blank');
  };

  // Print Thermal 58mm Receipt for Customer Ledger
  const handlePrintCustomerLedger = () => {
    if (!selectedCustomer) return;
    const W = settings.paperWidthChars || 32;
    const encoder = new EscPosEncoder();
    encoder.init();
    encoder.kickDrawer();

    encoder.align('center');
    encoder.bold(true);
    encoder.textLine(settings.storeName.toUpperCase());
    encoder.bold(false);
    if (settings.address) encoder.textLine(settings.address.substring(0, W));
    if (settings.phone) encoder.textLine('Telp: ' + settings.phone);
    encoder.textLine('-'.repeat(W));
    encoder.bold(true);
    encoder.textLine('BUKU UTANG / PIUTANG');
    encoder.bold(false);
    encoder.textLine('-'.repeat(W));

    encoder.align('left');
    encoder.textLine(`Pelanggan : ${selectedCustomer.customerName}`);
    if (selectedCustomer.customerPhone) {
      encoder.textLine(`No. HP    : ${selectedCustomer.customerPhone}`);
    }
    encoder.textLine(`Status    : ${selectedCustomer.status === 'lunas' ? 'LUNAS' : 'BELUM LUNAS'}`);
    if (selectedCustomer.dueDate) {
      encoder.textLine(`Jatuh Tempo: ${selectedCustomer.dueDate}`);
    }
    encoder.textLine(`Dicetak   : ${new Date().toLocaleString('id-ID')}`);
    encoder.textLine('-'.repeat(W));

    encoder.bold(true);
    encoder.textLine('RIWAYAT TRANSAKSI:');
    encoder.bold(false);

    // List recent mutations
    customerMutations.slice(0, 10).forEach(m => {
      const typeStr = m.type === 'give' ? '[BERIKAN]' : '[TERIMA] ';
      const dateStr = new Date(m.timestamp).toLocaleDateString('id-ID');
      const valStr = `Rp ${formatRupiah(m.amount)}`;
      encoder.textLine(`${dateStr} ${typeStr}`);
      if (m.note) encoder.textLine(` ${m.note.substring(0, W - 2)}`);
      encoder.align('right');
      encoder.textLine(valStr);
      encoder.align('left');
    });

    encoder.textLine('-'.repeat(W));
    encoder.align('right');
    encoder.textLine(`Total Bon Diberikan: Rp ${formatRupiah(selectedCustomer.totalAmount)}`);
    encoder.textLine(`Total Sudah Dicicil: Rp ${formatRupiah(selectedCustomer.paidAmount)}`);
    encoder.bold(true);
    encoder.textLine(`SISA TAGIHAN: Rp ${formatRupiah(selectedCustomer.remainingAmount)}`);
    encoder.bold(false);
    encoder.textLine('-'.repeat(W));

    encoder.align('center');
    encoder.textLine('Terima kasih atas kepercayaannya!');
    encoder.newline();
    encoder.newline();
    encoder.cut();

    const result = encoder.encode();
    console.log('Sending print command to printer...', result.byteLength, 'bytes');
    sounds.playSuccess();
    showToast('✓ Nota rincian utang berhasil dikirim ke printer!');
  };

  // Copy ledger text to clipboard
  const handleCopyLedgerText = () => {
    if (!selectedCustomer) return;
    const store = settings.storeName || 'Cool Kids Cell';
    let text = `*RINCIAN BUKU UTANG - ${store}*\n`;
    text += `Pelanggan: ${selectedCustomer.customerName}\n`;
    if (selectedCustomer.customerPhone) text += `No HP: ${selectedCustomer.customerPhone}\n`;
    text += `Status: ${selectedCustomer.status === 'lunas' ? 'LUNAS' : 'BELUM LUNAS'}\n`;
    if (selectedCustomer.dueDate) text += `Jatuh Tempo: ${selectedCustomer.dueDate}\n`;
    text += `--------------------------------\n`;
    text += `Total Diberikan: Rp ${formatRupiah(selectedCustomer.totalAmount)}\n`;
    text += `Sudah Dibayar: Rp ${formatRupiah(selectedCustomer.paidAmount)}\n`;
    text += `*SISA UTANG: Rp ${formatRupiah(selectedCustomer.remainingAmount)}*\n\n`;
    text += `Riwayat Transaksi:\n`;

    customerMutations.slice(0, 15).forEach((m, i) => {
      const dt = new Date(m.timestamp).toLocaleDateString('id-ID');
      const sym = m.type === 'give' ? '[-] Berikan' : '[+] Terima';
      text += `${i + 1}. ${dt} - ${sym} Rp ${formatRupiah(m.amount)} (${m.note || '-'})\n`;
    });

    navigator.clipboard.writeText(text);
    showToast('✓ Salinan laporan berhasil disalin ke clipboard!');
    setIsShareModalOpen(false);
  };

  // =========================================================================
  // VIEW 2: HALAMAN DETAIL BUKU UTANG PER PELANGGAN
  // =========================================================================
  if (selectedCustomer) {
    const isPaid = (selectedCustomer.remainingAmount || 0) === 0;
    const isDue = !isPaid && selectedCustomer.dueDate && selectedCustomer.dueDate <= metrics.todayStr;

    return (
      <div className="space-y-5 pb-28 animate-in fade-in duration-200">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="fixed top-5 right-5 z-50 bg-slate-900 border border-emerald-500/50 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-xs text-white">Sukses</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{toastMessage}</p>
            </div>
          </div>
        )}

        {/* Top Header & Back Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="p-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold shrink-0"
              title="Kembali ke Daftar Utang"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Daftar Utang</span>
            </button>

            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-11 h-11 rounded-2xl bg-gradient-to-tr ${getAvatarColor(selectedCustomer.customerName)} flex items-center justify-center text-white font-black text-base shadow-md shrink-0`}>
                {getInitials(selectedCustomer.customerName)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-white truncate">
                    {selectedCustomer.customerName}
                  </h2>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                    isPaid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {isPaid ? 'LUNAS' : 'BELUM LUNAS'}
                  </span>
                </div>
                {selectedCustomer.customerPhone ? (
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{selectedCustomer.customerPhone}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-0.5">Tanpa nomor telepon</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handlePrintCustomerLedger}
              className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl transition cursor-pointer"
              title="Cetak Nota Rincian 58mm"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
            </button>
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="p-2 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-xl transition cursor-pointer"
              title="Hapus Pelanggan Ini"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Big Balance & Quick Payoff Card */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 p-5 rounded-3xl shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Total Sisa Utang Aktif
              </span>
              <div className={`text-3xl sm:text-4xl font-black font-mono tracking-tight ${
                isPaid ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                Rp {formatRupiah(selectedCustomer.remainingAmount)}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                <span>Diberikan: <strong className="text-white font-mono">Rp {formatRupiah(selectedCustomer.totalAmount)}</strong></span>
                <span>•</span>
                <span>Sudah Diterima: <strong className="text-emerald-400 font-mono">Rp {formatRupiah(selectedCustomer.paidAmount)}</strong></span>
              </div>
            </div>

            {/* Quick Action: Lunaskan Button */}
            {!isPaid && (
              <button
                onClick={() => setIsPayoffModalOpen(true)}
                className="px-5 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition cursor-pointer shrink-0"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Lunaskan Sekarang</span>
              </button>
            )}
          </div>
        </div>

        {/* 3 Quick Action Buttons: Atur Jatuh Tempo, Bagikan Laporan, Tagih Utang */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* 1. Atur Jatuh Tempo */}
          <button
            onClick={() => {
              setTempDueDate(selectedCustomer.dueDate || '');
              setIsDueDateModalOpen(true);
            }}
            className={`p-3.5 rounded-2xl border text-left transition flex items-center justify-between cursor-pointer ${
              isDue 
                ? 'bg-rose-950/40 border-rose-500/50 text-rose-300' 
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDue ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-800 text-slate-300'}`}>
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Atur Jatuh Tempo</p>
                <p className="text-[11px] text-slate-400">
                  {selectedCustomer.dueDate ? selectedCustomer.dueDate : 'Belum diatur'}
                </p>
              </div>
            </div>
            {isDue && (
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white animate-pulse">
                Lewat!
              </span>
            )}
          </button>

          {/* 2. Bagikan Laporan */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="p-3.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl text-left transition flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-800 text-cyan-400 flex items-center justify-center">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Bagikan Laporan</p>
                <p className="text-[11px] text-slate-400">Kirim struk / salin teks</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>

          {/* 3. Tagih Utang (WhatsApp) */}
          <button
            onClick={handleSendWhatsAppReminder}
            className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 hover:bg-emerald-900/40 rounded-2xl text-left transition flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-300">Tagih Utang</p>
                <p className="text-[11px] text-slate-400">Kirim pesan WhatsApp</p>
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-emerald-400" />
          </button>
        </div>

        {/* Ledger Transaction History (Mutasi Buku Warung) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-extrabold text-white">Riwayat Transaksi</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400">
                {customerMutations.length} Catatan
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Hijau: Uang Masuk • Merah: Utang Diberikan
            </p>
          </div>

          {/* Two-Column Header for Ledger: Terima vs Berikan */}
          <div className="grid grid-cols-12 bg-slate-950 px-4 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 border-b border-slate-850">
            <div className="col-span-6 sm:col-span-5">Tanggal & Catatan</div>
            <div className="col-span-3 sm:col-span-3 text-right text-emerald-400">Terima (Rp)</div>
            <div className="col-span-3 sm:col-span-3 text-right text-rose-400">Berikan (Rp)</div>
            <div className="hidden sm:block sm:col-span-1 text-center">Aksi</div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-slate-850 max-h-[500px] overflow-y-auto">
            {customerMutations.map((mut) => {
              const isTake = mut.type === 'take';
              const isGive = mut.type === 'give';

              return (
                <div 
                  key={mut.id}
                  className="grid grid-cols-12 px-4 py-3.5 text-xs items-center hover:bg-slate-850/40 transition"
                >
                  {/* Info Date & Note */}
                  <div className="col-span-6 sm:col-span-5 pr-2">
                    <p className="text-[10px] font-mono text-slate-400">
                      {new Date(mut.timestamp).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })} • {new Date(mut.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="font-semibold text-white text-xs mt-0.5 truncate">
                      {mut.note || (isTake ? 'Pembayaran Utang' : 'Bon Belanja')}
                    </p>
                  </div>

                  {/* Terima Column (Hijau) */}
                  <div className="col-span-3 sm:col-span-3 text-right">
                    {isTake ? (
                      <span className="font-mono font-black text-emerald-400 text-xs sm:text-sm">
                        +Rp {formatRupiah(mut.amount)}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </div>

                  {/* Berikan Column (Merah) */}
                  <div className="col-span-3 sm:col-span-3 text-right">
                    {isGive ? (
                      <span className="font-mono font-black text-rose-400 text-xs sm:text-sm">
                        Rp {formatRupiah(mut.amount)}
                      </span>
                    ) : (
                      <span className="text-slate-600">-</span>
                    )}
                  </div>

                  {/* Action Delete */}
                  <div className="hidden sm:flex sm:col-span-1 justify-center">
                    <button
                      onClick={() => handleDeleteMutation(mut.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                      title="Hapus riwayat mutasi ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {customerMutations.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                Belum ada mutasi transaksi untuk pelanggan ini.
              </div>
            )}
          </div>
        </div>

        {/* =========================================================================
            FIXED BOTTOM DOCK: TWO BIG ACTION BUTTONS (BERIKAN & TERIMA)
            ========================================================================= */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 p-3 sm:p-4 shadow-2xl">
          <div className="max-w-4xl mx-auto grid grid-cols-2 gap-3">
            {/* Tombol Merah: Berikan (Tambah Utang) */}
            <button
              onClick={() => {
                setGiveAmount('');
                setGiveNote('');
                setIsGiveModalOpen(true);
              }}
              className="py-3.5 px-4 bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/30 transition cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span>Berikan (Tambah Bon)</span>
            </button>

            {/* Tombol Hijau: Terima (Catat Bayar / Cicil) */}
            <button
              onClick={() => {
                setTakeAmount('');
                setTakeNote('');
                setIsTakeModalOpen(true);
              }}
              className="py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <span>Terima (Bayar / Cicil)</span>
            </button>
          </div>
        </div>

        {/* Modal: "Berikan" (Tambah Utang Baru Pada Pelanggan Ini) */}
        {isGiveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-rose-500/40 w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <ArrowUpRight className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Berikan Utang</h3>
                    <p className="text-[11px] text-slate-400">{selectedCustomer.customerName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsGiveModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveGive} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Jumlah Nominal Utang (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    autoFocus
                    min={1}
                    placeholder="Contoh: 50000"
                    value={giveAmount}
                    onChange={e => setGiveAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-rose-500/60 rounded-xl text-rose-400 font-mono font-bold text-base focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Catatan / Rincian Barang
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Rokok Surya + Beras 5kg"
                    value={giveNote}
                    onChange={e => setGiveNote(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-slate-300 font-semibold flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-rose-400" />
                        Tanggal
                      </label>
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setGiveDate(new Date().toISOString().split('T')[0])}
                          className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                        >
                          Hari Ini
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const d = new Date();
                            d.setDate(d.getDate() - 1);
                            setGiveDate(d.toISOString().split('T')[0]);
                          }}
                          className="px-1 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                        >
                          Kemarin
                        </button>
                      </div>
                    </div>
                    <input
                      type="date"
                      value={giveDate}
                      onChange={e => setGiveDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-semibold">Jatuh Tempo (Opsional)</label>
                    <input
                      type="date"
                      value={giveDueDate}
                      onChange={e => setGiveDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsGiveModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-md transition"
                  >
                    Simpan Utang
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: "Terima" (Catat Pembayaran / Cicilan) */}
        {isTakeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-emerald-500/40 w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <ArrowDownLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Terima Pembayaran</h3>
                    <p className="text-[11px] text-slate-400">{selectedCustomer.customerName}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsTakeModalOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl text-xs space-y-1 border border-slate-800">
                <div className="flex justify-between text-slate-400">
                  <span>Sisa Utang Saat Ini:</span>
                  <span className="font-mono font-bold text-amber-400">
                    Rp {formatRupiah(selectedCustomer.remainingAmount)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSaveTake} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Jumlah Nominal Diterima (Rp) *
                  </label>
                  <input
                    type="number"
                    required
                    autoFocus
                    min={1}
                    placeholder="Contoh: 25000"
                    value={takeAmount}
                    onChange={e => setTakeAmount(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-950 border border-emerald-500/60 rounded-xl text-emerald-400 font-mono font-bold text-base focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    Catatan Pembayaran
                  </label>
                  <input
                    type="text"
                    placeholder="Contoh: Cicilan ke-1 / Titip Tetangga"
                    value={takeNote}
                    onChange={e => setTakeNote(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-emerald-400" />
                      Tanggal Pembayaran *
                    </label>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setTakeDate(new Date().toISOString().split('T')[0])}
                        className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                      >
                        Hari Ini
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() - 1);
                          setTakeDate(d.toISOString().split('T')[0]);
                        }}
                        className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                      >
                        Kemarin
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    required
                    value={takeDate}
                    onChange={e => setTakeDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {parseFloat(takeAmount) > 0 && (
                  <div className="p-2.5 bg-slate-950 rounded-xl border border-emerald-500/30 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Sisa Utang Nanti:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      Rp {formatRupiah(Math.max(0, selectedCustomer.remainingAmount - (parseFloat(takeAmount) || 0)))}
                    </span>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsTakeModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl shadow-md transition"
                  >
                    Simpan Pembayaran
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Atur Jatuh Tempo */}
        {isDueDateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-emerald-400" />
                Atur Tanggal Jatuh Tempo
              </h3>
              <p className="text-xs text-slate-400">
                Pilih batas tanggal janji bayar untuk <strong className="text-white">{selectedCustomer.customerName}</strong>.
              </p>

              <div>
                <label className="block text-slate-400 mb-1 text-xs">Tanggal Jatuh Tempo</label>
                <input
                  type="date"
                  value={tempDueDate}
                  onChange={e => setTempDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white text-xs focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2">
                {selectedCustomer.dueDate && (
                  <button
                    type="button"
                    onClick={() => setTempDueDate('')}
                    className="px-3 py-2 bg-rose-950/40 text-rose-300 border border-rose-800/40 rounded-xl text-xs font-bold"
                  >
                    Hapus
                  </button>
                )}
                <div className="flex-1 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsDueDateModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-medium"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDueDate}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Konfirmasi Lunaskan */}
        {isPayoffModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-emerald-500/40 w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Lunaskan Utang?</h3>
                  <p className="text-[11px] text-slate-400">{selectedCustomer.customerName}</p>
                </div>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Pelanggan akan melunasi seluruh sisa tagihan utang berjalan sebesar:
              </p>

              <div className="p-3.5 bg-slate-950 rounded-xl text-center border border-slate-800">
                <span className="text-2xl font-black text-emerald-400 font-mono">
                  Rp {formatRupiah(selectedCustomer.remainingAmount)}
                </span>
                <p className="text-[10px] text-slate-400 mt-1">Status akan otomatis berubah menjadi LUNAS.</p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPayoffModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleExecutePayoff}
                  className="flex-1 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-md shadow-emerald-500/20"
                >
                  Ya, Lunaskan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Bagikan Laporan */}
        {isShareModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Share2 className="w-4 h-4 text-cyan-400" />
                  Bagikan Laporan Utang
                </h3>
                <button onClick={() => setIsShareModalOpen(false)} className="text-slate-400 hover:text-white p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Pilih metode pembagian laporan mutasi utang untuk <strong className="text-white">{selectedCustomer.customerName}</strong>:
              </p>

              <div className="space-y-2 pt-1 text-xs">
                <button
                  onClick={handleSendWhatsAppReminder}
                  className="w-full p-3 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 rounded-xl text-emerald-300 font-bold flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Kirim Pesan Tagihan via WhatsApp</span>
                </button>

                <button
                  onClick={handleCopyLedgerText}
                  className="w-full p-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-200 font-semibold flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Share2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>Salin Teks Laporan ke Clipboard</span>
                </button>

                <button
                  onClick={() => {
                    setIsShareModalOpen(false);
                    handlePrintCustomerLedger();
                  }}
                  className="w-full p-3 bg-slate-800 hover:bg-slate-750 border border-slate-700 rounded-xl text-slate-200 font-semibold flex items-center gap-2.5 transition text-left cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Cetak Nota Struk Printer 58mm</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Hapus Pelanggan */}
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-rose-500/40 w-full max-w-sm rounded-3xl shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5 text-rose-400 pb-2 border-b border-slate-800">
                <Trash2 className="w-5 h-5" />
                <h3 className="text-base font-bold text-white">Hapus Pelanggan?</h3>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                Yakin ingin menghapus seluruh buku utang untuk <strong className="text-white">{selectedCustomer.customerName}</strong>? Riwayat mutasi dan saldo utang akan dihapus permanen.
              </p>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-medium"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDeleteCustomer}
                  className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-md shadow-rose-600/30"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Konfirmasi Hapus Catatan Transaksi */}
        {mutationToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-900 border border-rose-500/40 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Hapus Catatan Transaksi?</h3>
                    <p className="text-[11px] text-slate-400">Apakah Anda yakin ingin menghapus catatan transaksi ini?</p>
                  </div>
                </div>
                <button
                  onClick={() => setMutationToDelete(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-1">
                <p className="text-slate-400">Keterangan: <span className="text-white font-medium">{mutationToDelete.note || '-'}</span></p>
                <p className="text-slate-400">Nominal: <span className="text-rose-400 font-mono font-bold">Rp {formatRupiah(mutationToDelete.amount)}</span></p>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMutationToDelete(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium text-xs"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const mutId = mutationToDelete.id;
                    setMutationToDelete(null);
                    await executeDeleteMutation(mutId);
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-md transition text-xs"
                >
                  Ya, Hapus
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // VIEW 1: HALAMAN UTAMA UTANG (DAFTAR PELANGGAN - BUKU WARUNG STYLE)
  // =========================================================================
  return (
    <div className="space-y-6 pb-24 relative animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 border border-emerald-500/50 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <p className="font-bold text-xs text-white">Sukses</p>
            <p className="text-[11px] text-slate-400 mt-0.5">{toastMessage}</p>
          </div>
        </div>
      )}

      {/* 1. DUA KARTU RINGKASAN ATAS: "Utang Saya" & "Utang Pelanggan" */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Kartu: Utang Pelanggan (Piutang) */}
        <div 
          onClick={() => setActiveCategory('pelanggan')}
          className={`p-5 rounded-3xl border transition cursor-pointer relative overflow-hidden ${
            activeCategory === 'pelanggan'
              ? 'bg-slate-900 border-rose-500/60 shadow-lg shadow-rose-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 opacity-80'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Utang Pelanggan
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">Uang yang harus Anda terima</p>
            </div>
            <div className="w-9 h-9 rounded-2xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-rose-400 mt-3">
            Rp {formatRupiah(metrics.totalUtangPelanggan)}
          </div>
          <div className="mt-2 text-xs flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-rose-400"></span>
            <span>{metrics.countPelangganUnpaid} Pelanggan Belum Lunas</span>
          </div>
        </div>

        {/* Kartu: Utang Saya (Hutang ke Supplier) */}
        <div 
          onClick={() => setActiveCategory('saya')}
          className={`p-5 rounded-3xl border transition cursor-pointer relative overflow-hidden ${
            activeCategory === 'saya'
              ? 'bg-slate-900 border-amber-500/60 shadow-lg shadow-amber-500/10'
              : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 opacity-80'
          }`}
        >
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Utang Saya
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">Uang yang harus Anda bayar</p>
            </div>
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black font-mono text-amber-400 mt-3">
            Rp {formatRupiah(metrics.totalUtangSaya)}
          </div>
          <div className="mt-2 text-xs flex items-center gap-1.5 text-slate-400">
            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
            <span>{metrics.countSayaUnpaid} Pihak Belum Lunas</span>
          </div>
        </div>
      </div>

      {/* 2. SEARCH BAR & FILTER STATUS PILLS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3.5 rounded-2xl">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={`Cari nama ${activeCategory === 'pelanggan' ? 'pelanggan' : 'supplier'}...`}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Status: Semua, Belum Lunas, Jatuh Tempo, Lunas */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              statusFilter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Semua
          </button>
          <button
            onClick={() => setStatusFilter('unpaid')}
            className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              statusFilter === 'unpaid' ? 'bg-slate-800 text-rose-400 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Belum Lunas
          </button>
          <button
            onClick={() => setStatusFilter('due')}
            className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              statusFilter === 'due' ? 'bg-slate-800 text-amber-400 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Jatuh Tempo
          </button>
          <button
            onClick={() => setStatusFilter('paid')}
            className={`px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap ${
              statusFilter === 'paid' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            Lunas
          </button>
        </div>
      </div>

      {/* 3. DAFTAR PELANGGAN DALAM BENTUK LIST KARTU MODERN (BUKU WARUNG STYLE) */}
      <div className="space-y-2.5">
        {filteredDebts.map(customer => {
          const isPaid = (customer.remainingAmount || 0) === 0;
          const isDue = !isPaid && customer.dueDate && customer.dueDate <= metrics.todayStr;

          return (
            <div
              key={customer.id || customer.firestoreId}
              onClick={() => setSelectedCustomerId(customer.id || customer.firestoreId)}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-850/60 p-4 rounded-2xl transition cursor-pointer flex items-center justify-between gap-3 shadow-sm group"
            >
              {/* Left: Avatar with Initials & Info */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-tr ${getAvatarColor(customer.customerName)} flex items-center justify-center text-white font-extrabold text-base shadow-md shrink-0`}>
                  {getInitials(customer.customerName)}
                </div>

                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h4 className="font-extrabold text-white text-sm truncate group-hover:text-emerald-400 transition">
                      {customer.customerName}
                    </h4>
                    {isDue && (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        Jatuh Tempo!
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    {customer.customerPhone ? (
                      <span className="flex items-center gap-1 text-[11px]">
                        <Phone className="w-3 h-3 text-emerald-400" />
                        {customer.customerPhone}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-500">
                        {customer.description ? customer.description.substring(0, 24) : 'Bon Belanja'}
                      </span>
                    )}

                    {customer.dueDate && (
                      <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                        • Tempo: {customer.dueDate}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Remaining Amount & Status */}
              <div className="text-right shrink-0 flex items-center gap-3">
                <div>
                  <div className={`font-mono font-black text-sm sm:text-base ${
                    isPaid ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {isPaid ? 'Rp 0' : `Rp ${formatRupiah(customer.remainingAmount)}`}
                  </div>
                  <span className={`text-[10px] font-bold ${
                    isPaid ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                    {isPaid ? 'LUNAS' : 'Belum Lunas'}
                  </span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 group-hover:translate-x-0.5 transition" />
              </div>
            </div>
          );
        })}

        {filteredDebts.length === 0 && (
          <div className="py-16 text-center text-slate-500 bg-slate-900/60 border border-slate-800 rounded-3xl p-6">
            <User className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
            <p className="text-sm font-bold text-slate-300">
              Tidak ada data {activeCategory === 'pelanggan' ? 'utang pelanggan' : 'utang saya'}.
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Klik tombol "+ Catat Utang" di bawah untuk menambahkan catatan baru.
            </p>
          </div>
        )}
      </div>

      {/* 4. FLOATING ACTION BUTTON (FAB): "+ Catat Utang" */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => {
            setFormCustomerName('');
            setFormCustomerPhone('');
            setFormAmount('');
            setFormDescription('');
            setFormDueDate('');
            setFormCategory(activeCategory);
            setIsNewDebtModalOpen(true);
          }}
          className="px-5 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-95 text-slate-950 font-black rounded-full shadow-2xl shadow-emerald-500/40 flex items-center gap-2.5 transition cursor-pointer text-sm tracking-wide"
        >
          <div className="w-6 h-6 rounded-full bg-slate-950/20 flex items-center justify-center">
            <Plus className="w-4 h-4 text-slate-950 font-black" />
          </div>
          <span>+ Catat Utang</span>
        </button>
      </div>

      {/* =========================================================================
          MODAL: CATAT UTANG BARU (+ Catat Utang)
          ========================================================================= */}
      {isNewDebtModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-3xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-500 text-slate-950 font-black flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Catat Utang Baru</h3>
                  <p className="text-[11px] text-slate-400">Tambah buku utang / piutang baru</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewDebtModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category Toggle: Utang Pelanggan vs Utang Saya */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setFormCategory('pelanggan')}
                className={`py-2 rounded-lg font-bold transition ${
                  formCategory === 'pelanggan' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Utang Pelanggan (Piutang)
              </button>
              <button
                type="button"
                onClick={() => setFormCategory('saya')}
                className={`py-2 rounded-lg font-bold transition ${
                  formCategory === 'saya' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                }`}
              >
                Utang Saya (Ke Supplier)
              </button>
            </div>

            <form onSubmit={handleSaveNewDebt} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">
                    {formCategory === 'pelanggan' ? 'Nama Pelanggan *' : 'Nama Supplier / Pihak *'}
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Contoh: Pak Budi"
                    value={formCustomerName}
                    onChange={e => setFormCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-bold focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">No. WhatsApp / HP</label>
                  <input
                    type="text"
                    placeholder="08123456789"
                    value={formCustomerPhone}
                    onChange={e => setFormCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Nominal Utang (Rp) *
                </label>
                <input
                  type="number"
                  required
                  min={1}
                  placeholder="Contoh: 75000"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-emerald-500/60 rounded-xl text-emerald-400 font-mono font-bold text-base focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Keperluan / Rincian Barang
                </label>
                <textarea
                  rows={2}
                  placeholder="Contoh: Pulsa 50rb & Rokok Surya"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Tanggal Utang & Jatuh Tempo */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      Tanggal Utang *
                    </label>
                    <div className="flex items-center gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setFormDate(new Date().toISOString().split('T')[0])}
                        className={`px-1.5 py-0.5 rounded transition ${
                          formDate === new Date().toISOString().split('T')[0]
                            ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/40'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        Hari Ini
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          d.setDate(d.getDate() - 1);
                          setFormDate(d.toISOString().split('T')[0]);
                        }}
                        className="px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
                      >
                        Kemarin
                      </button>
                    </div>
                  </div>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white font-medium focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Jatuh Tempo (Opsional)
                  </label>
                  <input
                    type="date"
                    value={formDueDate}
                    onChange={e => setFormDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-750 rounded-xl text-white focus:outline-none focus:border-slate-600"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewDebtModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-xl font-medium transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl shadow-md transition cursor-pointer"
                >
                  Simpan Catatan Utang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BukuUtang;
