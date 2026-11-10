'use client';
import { Printer } from 'lucide-react';
import s from './invoice.module.css';
export function PrintInvoice() { return <><style>{`@media print { body * { visibility: hidden; } #client-invoice, #client-invoice * { visibility: visible; } #client-invoice { position: absolute; left: 0; top: 0; width: 100%; margin: 0 !important; } #invoice-print { display: none; } }`}</style><button id="invoice-print" type="button" className={s.printButton} onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print / save PDF</button></>; }
