import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { haptic, uiTap } from '../services/feedback';
import { colors, fonts, hitSlop, radius, spacing } from '../theme';
import { AText } from './AText';

type IconName = ComponentProps<typeof Ionicons>['name'];

// ─── Chip ───────────────────────────────────────────────────────────────────

export function Chip({ label, selected, onPress, icon, disabled }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'checkbox' : 'text'}
      accessibilityState={{ checked: !!selected, disabled: !!disabled }}
      accessibilityLabel={label}
      disabled={disabled || !onPress}
      onPress={() => {
        haptic('select');
        onPress?.();
      }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, disabled && { opacity: 0.4 }, pressed && { opacity: 0.8 }]}
    >
      {icon && <Ionicons name={icon} size={14} color={selected ? colors.text : colors.textMuted} style={{ marginRight: 6 }} />}
      <AText variant="smallStrong" color={selected ? colors.text : colors.textMuted}>
        {label}
      </AText>
    </Pressable>
  );
}

export function ChipGroup<T extends string | number>({
  options,
  value,
  onChange,
  multi,
}: {
  options: { value: T; label: string; icon?: IconName; disabled?: boolean }[];
  value: T | T[];
  onChange: (v: T | T[]) => void;
  multi?: boolean;
}) {
  const selected = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View style={styles.wrap}>
      {options.map((o) => (
        <Chip
          key={String(o.value)}
          label={o.label}
          icon={o.icon}
          disabled={o.disabled}
          selected={selected(o.value)}
          onPress={() => {
            if (!multi) return onChange(o.value);
            const arr = Array.isArray(value) ? value : [];
            onChange(arr.includes(o.value) ? arr.filter((x) => x !== o.value) : [...arr, o.value]);
          }}
        />
      ))}
    </View>
  );
}

// ─── Option card (large single-select) ─────────────────────────────────────

export function OptionCard({ title, description, icon, selected, onPress }: { title: string; description?: string; icon?: IconName; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={() => {
        haptic('select');
        onPress();
      }}
      style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && { opacity: 0.85 }]}
    >
      {icon && (
        <View style={[styles.optionIcon, selected && { backgroundColor: colors.violetWash, borderColor: colors.violet }]}>
          <Ionicons name={icon} size={20} color={selected ? colors.violetBright : colors.silverDim} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <AText variant="bodyStrong">{title}</AText>
        {description && (
          <AText variant="small" muted>
            {description}
          </AText>
        )}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected && <View style={styles.radioDot} />}</View>
    </Pressable>
  );
}

// ─── Segmented control ─────────────────────────────────────────────────────

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic('select');
              onChange(o.value);
            }}
            style={[styles.segItem, on && styles.segOn]}
          >
            <AText variant="smallStrong" color={on ? colors.text : colors.textMuted}>
              {o.label}
            </AText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Stepper (number entry with +/- and direct typing) ─────────────────────

export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  label,
  suffix,
  decimals = 0,
  large,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  label: string;
  suffix?: string;
  decimals?: number;
  large?: boolean;
}) {
  const clampV = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));
  const fmt = (v: number) => (decimals ? v.toFixed(v % 1 === 0 ? 0 : decimals) : String(Math.round(v)));
  return (
    <View style={{ flex: 1 }}>
      <AText variant="label" muted style={{ marginBottom: 6 }}>
        {label}
      </AText>
      <View style={[styles.stepper, large && { height: 64 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
          hitSlop={hitSlop}
          onPress={() => {
            haptic('select');
            onChange(clampV(value - step));
          }}
          style={styles.stepBtn}
        >
          <Ionicons name="remove" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
          <TextInput
            accessibilityLabel={label}
            value={fmt(value)}
            keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
            selectTextOnFocus
            onChangeText={(t) => {
              const n = parseFloat(t.replace(',', '.'));
              if (!Number.isNaN(n)) onChange(clampV(n));
              else if (t === '') onChange(min);
            }}
            style={[styles.stepInput, large && { fontSize: 30 }]}
          />
          {suffix && (
            <AText variant="small" muted style={{ marginLeft: 4 }}>
              {suffix}
            </AText>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
          hitSlop={hitSlop}
          onPress={() => {
            haptic('select');
            onChange(clampV(value + step));
          }}
          style={styles.stepBtn}
        >
          <Ionicons name="add" size={22} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Text field ────────────────────────────────────────────────────────────

export function Field({ label, error, hint, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <AText variant="label" muted>
        {label}
      </AText>
      <TextInput
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={label}
        {...props}
        style={[styles.field, error ? { borderColor: colors.danger } : null, props.multiline && { height: 96, textAlignVertical: 'top', paddingTop: 12 }, props.style]}
      />
      {error ? (
        <AText variant="small" color={colors.danger} accessibilityLiveRegion="polite">
          {error}
        </AText>
      ) : hint ? (
        <AText variant="small" faint>
          {hint}
        </AText>
      ) : null}
    </View>
  );
}

// ─── Rating row (1..5) ─────────────────────────────────────────────────────

export function RatingRow({ label, value, onChange, low, high }: { label: string; value: number | null; onChange: (v: number) => void; low: string; high: string }) {
  return (
    <View style={{ gap: 8 }}>
      <AText variant="bodyStrong">{label}</AText>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${label} ${n} of 5`}
              onPress={() => {
                haptic('select');
                onChange(n);
              }}
              style={[styles.rate, on && styles.rateOn]}
            >
              <AText variant="h3" color={on ? colors.text : colors.textMuted}>
                {n}
              </AText>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AText variant="tiny" faint>
          {low}
        </AText>
        <AText variant="tiny" faint>
          {high}
        </AText>
      </View>
    </View>
  );
}

// ─── Misc ──────────────────────────────────────────────────────────────────

export function IconButton({ icon, label, onPress, color = colors.text, size = 20, badge }: { icon: IconName; label: string; onPress: () => void; color?: string; size?: number; badge?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={hitSlop}
      onPress={() => {
        uiTap();
        onPress();
      }}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={size} color={color} />
      {badge && <View style={styles.badge} />}
    </Pressable>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <AText variant="h3" color={colors.silver} accessibilityRole="header">
        {children}
      </AText>
      {right}
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

export function Banner({ tone = 'info', icon, children, action }: { tone?: 'info' | 'warning' | 'success' | 'danger' | 'demo'; icon?: IconName; children: ReactNode; action?: ReactNode }) {
  const t = {
    info: { bg: colors.blueWash, fg: colors.blueSoft, icon: 'information-circle' as IconName },
    warning: { bg: colors.warningWash, fg: colors.warning, icon: 'warning' as IconName },
    success: { bg: colors.successWash, fg: colors.success, icon: 'checkmark-circle' as IconName },
    danger: { bg: colors.dangerWash, fg: colors.danger, icon: 'alert-circle' as IconName },
    demo: { bg: colors.warningWash, fg: colors.warning, icon: 'flask' as IconName },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg, borderColor: t.fg + '44' }]} accessibilityRole="alert">
      <Ionicons name={icon ?? t.icon} size={18} color={t.fg} />
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <AText variant="small" color={t.fg}>{children}</AText> : children}</View>
      {action}
    </View>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.violetBright} />
      </View>
      <AText variant="h3" align="center">
        {title}
      </AText>
      <AText variant="small" muted align="center" style={{ maxWidth: 300 }}>
        {body}
      </AText>
      {action}
    </View>
  );
}

export function StatBlock({ value, label, accent }: { value: string | number; label: string; accent?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 70 }} accessible accessibilityLabel={`${label}: ${value}`}>
      <AText variant="stat" color={accent ?? colors.text}>
        {value}
      </AText>
      <AText variant="tiny" muted style={{ marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
        {label}
      </AText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.violetWash, borderColor: colors.violet },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionOn: { borderColor: colors.violet, backgroundColor: '#15121F' },
  optionIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.violet },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violet },
  seg: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 3, borderWidth: 1, borderColor: colors.border },
  segItem: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 34, borderRadius: radius.sm },
  segOn: { backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.borderStrong },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 54, borderRadius: radius.md, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  stepBtn: { width: 48, height: '100%', alignItems: 'center', justifyContent: 'center' },
  stepInput: { color: colors.text, fontFamily: fonts.display, fontSize: 24, textAlign: 'center', minWidth: 40, padding: 0 },
  field: {
    height: 50,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 16,
  },
  rate: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  rateOn: { backgroundColor: colors.violetWash, borderColor: colors.violet },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border },
  badge: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.violetBright },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.violetWash, borderWidth: 1, borderColor: colors.violetDeep, marginBottom: spacing.sm },
});
