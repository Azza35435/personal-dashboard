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

export interface Habit {
  id: string
  name: string
  active: boolean
  position: number
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
