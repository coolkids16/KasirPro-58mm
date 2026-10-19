import React, { useState, useRef, useEffect } from 'react';
import { DayPicker, Chevron } from 'react-day-picker';
import { format, parse, addMonths, subMonths, setMonth, setYear } from 'date-fns';
import { id } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import 'react-day-picker/style.css';

interface DatePickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const YEARS = Array.from({ length: 11 }, (_, i) => 2020 + i); // 2020-2030

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  className = '',
  placeholder = 'Pilih tanggal'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showMonthYearPicker, setShowMonthYearPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : undefined;
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'));
      setIsOpen(false);
    }
  };

  const handleMonthChange = (direction: 'prev' | 'next') => {
    setCurrentMonth(prev => direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1));
  };

  const handleMonthSelect = (monthIndex: number) => {
    setCurrentMonth(prev => setMonth(prev, monthIndex));
    setShowMonthYearPicker(false);
  };

  const handleYearSelect = (year: number) => {
    setCurrentMonth(prev => setYear(prev, year));
    setShowMonthYearPicker(false);
  };

  const displayValue = selectedDate ? format(selectedDate, 'dd MMMM yyyy', { locale: id }) : '';
  const captionLabel = format(currentMonth, 'MMMM yyyy', { locale: id });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 flex items-center justify-between ${className}`}
      >
        <span className={displayValue ? '' : 'text-slate-400'}>
          {displayValue || placeholder}
        </span>
        <Calendar className="w-4 h-4 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl p-3">
          <style>{`
            .rdp {
              --rdp-cell-size: 28px;
              --rdp-accent-color: #059669;
              --rdp-background-color: #d1fae5;
              margin: 0;
            }
            .rdp-months {
              justify-content: center;
            }
            .rdp-month {
              margin: 0;
            }
            .rdp-month_caption,
            .rdp-caption_label,
            .rdp-button_previous,
            .rdp-button_next {
              display: none !important;
            }
            .rdp-month > div:first-child {
              display: none !important;
            }
            .custom-caption {
              display: flex !important;
              justify-content: space-between;
              align-items: center;
              padding: 6px 0;
              margin-bottom: 6px;
            }
            .custom-caption-label {
              font-size: 12px;
              font-weight: 600;
              color: #0f172a;
              flex: 1;
              text-align: center;
            }
            html.dark .custom-caption-label {
              color: #f1f5f9;
            }
            .rdp-caption_label {
              font-size: 12px;
              font-weight: 600;
              color: #0f172a;
              flex: 1;
              text-align: center;
            }
            html.dark .rdp-caption_label {
              color: #f1f5f9;
            }
            .rdp-nav {
              display: flex;
              gap: 2px;
            }
            .rdp-nav_button {
              width: 22px;
              height: 22px;
              border-radius: 4px;
              display: flex;
              align-items: center;
              justify-content: center;
              background: transparent;
              border: none;
              cursor: pointer;
              color: #64748b;
              transition: all 0.15s ease;
            }
            .rdp-nav_button:hover {
              background: #e2e8f0;
              color: #059669;
            }
            html.dark .rdp-nav_button:hover {
              background: #334155;
              color: #10b981;
            }
            .rdp-head_cell {
              font-size: 10px;
              font-weight: 600;
              color: #64748b;
              text-transform: uppercase;
              padding: 3px 0;
            }
            .rdp-cell {
              padding: 1px;
            }
            .rdp-day {
              width: 100%;
              height: 100%;
              border-radius: 4px;
              font-size: 11px;
              color: #1e293b;
              border: none;
              background: transparent;
              cursor: pointer;
            }
            html.dark .rdp-day {
              color: #e2e8f0;
            }
            .rdp-day:hover:not(.rdp-day_selected) {
              background: #f1f5f9;
              color: #059669;
            }
            html.dark .rdp-day:hover:not(.rdp-day_selected) {
              background: #334155;
            }
            .rdp-day_selected {
              background: #059669 !important;
              color: white !important;
              font-weight: 600;
            }
            .rdp-day_today:not(.rdp-day_selected) {
              font-weight: 700;
              color: #059669;
            }
            .rdp-day_outside {
              color: #cbd5e1;
            }
            html.dark .rdp-day_outside {
              color: #475569;
            }
          `}</style>
          <div className="custom-caption">
            <button
              type="button"
              className="rdp-nav_button"
              onClick={() => handleMonthChange('prev')}
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowMonthYearPicker(!showMonthYearPicker)}
              className="custom-caption-label"
            >
              {captionLabel}
            </button>
            <button
              type="button"
              className="rdp-nav_button"
              onClick={() => handleMonthChange('next')}
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          {showMonthYearPicker && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <select
                  value={currentMonth.getMonth()}
                  onChange={(e) => handleMonthSelect(parseInt(e.target.value))}
                  className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {MONTHS.map((month, idx) => (
                    <option key={idx} value={idx}>{month}</option>
                  ))}
                </select>
              </div>
              <div>
                <select
                  value={currentMonth.getFullYear()}
                  onChange={(e) => handleYearSelect(parseInt(e.target.value))}
                  className="w-full px-2 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {YEARS.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            locale={id}
            month={currentMonth}
            fromDate={new Date(2020, 0, 1)}
            toDate={new Date(2030, 11, 31)}
            showOutsideDays
            fixedWeeks
            components={{
              Caption: () => null
            }}
          />
        </div>
      )}
    </div>
  );
};
