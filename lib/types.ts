export type AccountType = 'checking' | 'savings' | 'cash' | 'owed'
export type AccountGroup = 'personal' | 'family' | 'business'
export type IncomeCategory = 'freelance' | 'swimming' | 'investments' | 'centrelink'
export type Priority = 'low' | 'medium' | 'high'

export interface Account {
  id: string
  name: string
  type: AccountType
  group_name: AccountGroup
  balance: number
  updated_at: string
}

export interface IncomeStream {
  id: string
  name: string
  category: IncomeCategory
  amount: number
  billing_cycle: 'monthly' | 'fortnightly'
  destination: AccountGroup
  updated_at: string
}

export interface Todo {
  id: string
  title: string
  project: string | null
  due_date: string | null
  priority: Priority
  completed: boolean
  created_at: string
}

export interface Note {
  id: number
  content: string | null
  updated_at: string
}

export interface HabitGroup {
  id: string
  name: string
  position: number
  created_at: string
}

export interface Habit {
  id: string
  name: string
  active: boolean
  position: number
  group_id: string | null
  created_at: string
}

export interface HabitCompletion {
  habit_id: string
  date: string
}

export interface NutritionLog {
  id: string
  meal_name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  date: string
  logged_at: string
}

export interface Section {
  id: string
  name: string
  color: string | null
  position: number
  created_at: string
  curricular_id?: string | null
}

export interface Curricular {
  id: string
  name: string
  color: string | null
  position: number
  created_at: string
}

export interface CurricularMetric {
  id: string
  curricular_id: string
  label: string
  value: string
  unit: string | null
  position: number
  created_at: string
}

export interface CurricularLink {
  id: string
  curricular_id: string
  title: string
  url: string
  position: number
  created_at: string
}

export interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  colorId?: string
}

export interface GymSession {
  id: string
  date: string
  workout_type: string
  duration_minutes: number | null
  notes: string | null
  color: string | null
  created_at: string
}

export interface GymSetRow {
  reps: number | null
  weight_kg: number | null
}

export interface GymExercise {
  id: string
  session_id: string
  name: string
  sets: number | null
  reps: number | null
  weight_kg: number | null
  sets_data: GymSetRow[] | null
  position: number
  superset_group: string | null
  created_at: string
}

export interface GymTemplate {
  id: string
  name: string
  workout_type: string
  color: string | null
  created_at: string
}

export interface GymTemplateExercise {
  id: string
  template_id: string
  name: string
  sets: number | null
  reps: number | null
  weight_kg: number | null
  sets_data: GymSetRow[] | null
  position: number
  superset_group: string | null
}

export type BillingCycle = 'monthly' | 'fortnightly' | 'yearly' | 'weekly' | 'one-off'
export type SubscriptionCategory = 'personal' | 'work' | 'study'

export interface Subscription {
  id: string
  name: string
  amount: number
  billing_cycle: BillingCycle
  next_payment_date: string | null
  category: SubscriptionCategory
  curricular_id: string | null
  notes: string | null
  active: boolean
  payment_type: 'subscription' | 'manual'
  is_recurring: boolean
  paid: boolean
  created_at: string
}

export interface CurricularDeadline {
  id: string
  curricular_id: string
  title: string
  module: string | null
  due_date: string
  priority: Priority
  completed: boolean
  todo_id: string | null
  position: number
  created_at: string
}

export interface AppleHealthLog {
  date: string
  steps: number | null
  active_energy_kcal: number | null
  resting_hr: number | null
  hrv_ms: number | null
  sleep_total_min: number | null
  sleep_deep_min: number | null
  sleep_rem_min: number | null
  sleep_core_min: number | null
  sleep_awake_min: number | null
  blood_oxygen_pct: number | null
  respiratory_rate: number | null
  vo2_max: number | null
  exercise_min: number | null
  stand_hours: number | null
  weight_kg: number | null
  updated_at: string
}

export type ShoppingStore = 'woolworths' | 'coles' | 'chemist'
export type ShoppingAlertType = 'any' | 'percent' | 'price'
export type ShoppingStatus = 'watching' | 'purchased'

export interface ShoppingItem {
  id: string
  user_id: string
  name: string
  search_query: string | null
  woolworths_url: string | null
  coles_url: string | null
  chemist_url: string | null
  alert_type: ShoppingAlertType
  alert_value: number | null
  status: ShoppingStatus
  on_sale_now: boolean
  last_sale_detected_at: string | null
  dismissed_at: string | null
  position: number
  created_at: string
}

export interface ShoppingPrice {
  id: string
  item_id: string
  store: ShoppingStore
  product_name: string | null
  product_url: string | null
  price: number | null
  was_price: number | null
  on_special: boolean
  checked_at: string
}

export interface Profile {
  id: string
  email: string
  display_name: string | null
  avatar_url: string | null
  is_admin: boolean
  created_at: string
}

export interface SidebarPref {
  href: string
  position: number
  hidden: boolean
  custom_label: string | null
}

export type RecipeCategory = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface CookbookRecipe {
  id: string
  name: string
  category: RecipeCategory
  tried: boolean
  ingredients: string | null
  calories: number
  protein: number
  carbs: number
  fat: number
  notes: string | null
  created_at: string
}
