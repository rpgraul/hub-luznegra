export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type UserRole = 'admin' | 'member'
export type NotificationType = 'task_assigned' | 'due_date_reminder' | 'mention'
export type DefaultView = 'gantt' | 'kanban' | 'lista' | 'calendario'

export type Profile = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  role: UserRole
  ferias_inicio: string | null
  ferias_fim: string | null
  created_at: string
}

export type UserPreferences = {
  user_id: string
  default_view: DefaultView
  active_project_id: string | null
  show_all_tasks: boolean
  hide_done_tasks?: boolean
  updated_at: string
}

export type Project = {
  id: string
  name: string
  description: string | null
  color: string
  owner_id: string | null
  archived: boolean
  created_at: string
}

export type Task = {
  id: string
  title: string
  description: Json | null
  project_id: string | null
  parent_id: string | null
  status: TaskStatus
  priority: TaskPriority
  start_date: string | null
  due_date: string | null
  estimated_hours: number | null
  actual_hours: number | null
  order_index: number
  assigned_to: string | null
  assignees?: string[] | null
  created_by: string | null
  tags?: string[] | null
  created_at: string
  updated_at: string
}

export type TaskComment = {
  id: string
  task_id: string
  author_id: string
  content: string
  created_at: string
}

export type Notification = {
  id: string
  user_id: string
  type: NotificationType
  content: string
  link: string | null
  read: boolean
  created_at: string
  task_id: string | null
}

export type HubLink = {
  id: string
  title: string
  url: string
  description: string | null
  tags: string[]
  task_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type HubDocument = {
  id: string
  title: string
  file_name: string
  file_type: string
  file_size: number
  file_key: string
  file_url: string
  extracted_text: string | null
  tags: string[]
  task_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: {
          id: string
          username: string
          full_name?: string | null
          avatar_url?: string | null
          role?: UserRole
          ferias_inicio?: string | null
          ferias_fim?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          full_name?: string | null
          avatar_url?: string | null
          role?: UserRole
          ferias_inicio?: string | null
          ferias_fim?: string | null
          created_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: UserPreferences
        Insert: {
          user_id: string
          default_view?: DefaultView
          active_project_id?: string | null
          show_all_tasks?: boolean
          updated_at?: string
        }
        Update: {
          user_id?: string
          default_view?: DefaultView
          active_project_id?: string | null
          show_all_tasks?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: Project
        Insert: {
          id?: string
          name: string
          description?: string | null
          color?: string
          owner_id?: string | null
          archived?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          color?: string
          owner_id?: string | null
          archived?: boolean
          created_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: Task
        Insert: {
          id?: string
          title: string
          description?: Json | null
          project_id?: string | null
          parent_id?: string | null
          status?: TaskStatus
          priority?: TaskPriority
          start_date?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          order_index?: number
          assigned_to?: string | null
          assignees?: string[] | null
          created_by?: string | null
          tags?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: Json | null
          project_id?: string | null
          parent_id?: string | null
          status?: TaskStatus
          priority?: TaskPriority
          start_date?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          actual_hours?: number | null
          order_index?: number
          assigned_to?: string | null
          assignees?: string[] | null
          created_by?: string | null
          tags?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: TaskComment
        Insert: {
          id?: string
          task_id: string
          author_id: string
          content: string
          created_at?: string
        }
        Update: {
          id?: string
          task_id?: string
          author_id?: string
          content?: string
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: Notification
        Insert: {
          id?: string
          user_id: string
          type: NotificationType
          content: string
          link?: string | null
          read?: boolean
          created_at?: string
          task_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: NotificationType
          content?: string
          link?: string | null
          read?: boolean
          created_at?: string
          task_id?: string | null
        }
        Relationships: []
      }
      hub_links: {
        Row: HubLink
        Insert: {
          id?: string
          title: string
          url: string
          description?: string | null
          tags?: string[]
          task_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          url?: string
          description?: string | null
          tags?: string[]
          task_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      hub_documents: {
        Row: HubDocument
        Insert: {
          id?: string
          title: string
          file_name: string
          file_type: string
          file_size?: number
          file_key: string
          file_url: string
          extracted_text?: string | null
          tags?: string[]
          task_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          file_name?: string
          file_type?: string
          file_size?: number
          file_key?: string
          file_url?: string
          extracted_text?: string | null
          tags?: string[]
          task_id?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      resolve_login_email: {
        Args: { p_username: string };
        Returns: string;
      };
      is_project_participant: {
        Args: { p_project_id: string };
        Returns: boolean;
      };
    }
    Enums: Record<string, never>
  }
}