# Модель данных EventHub

Схема после миграций этапов А и Б (`migrations/`). Диаграмма в формате Mermaid отображается на GitHub и в редакторах с поддержкой Mermaid.

```mermaid
erDiagram
    users ||--o{ events : "организует (organizer_id)"
    categories |o--o{ events : "category_id"
    users ||--o{ registrations : "user_id"
    events ||--o{ registrations : "event_id"
    registrations ||--o{ reminders : "registration_id"
    users ||--o{ reminders : "user_id"
    events ||--o{ reminders : "event_id"
    users ||--o{ notifications : "user_id"
    events |o--o{ notifications : "event_id"
    registrations |o--o{ notifications : "registration_id"
    reminders |o--o| notifications : "reminder_id"
    events ||--o{ messages : "event_id"
    users |o--o{ messages : "user_id"
    users ||--o{ favorites : "user_id"
    events ||--o{ favorites : "event_id"

    users {
        bigint id PK
        varchar name
        varchar email UK "NULL только у удаленных"
        text password_hash
        text role "user | organizer | admin"
        varchar city
        boolean blocked
        timestamptz blocked_at
        text status "active | deactivated | deleted"
        timestamptz deactivated_at
        text deactivated_by "user | admin"
        timestamptz deleted_at
        int token_version
    }
    categories {
        bigint id PK
        varchar name UK
        varchar slug UK
        char color
        varchar description
    }
    events {
        bigint id PK
        varchar title
        text type "conference | webinar | meeting"
        text status "draft | published | cancelled"
        text timezone "IANA"
        bigint category_id FK
        bigint organizer_id FK
        timestamptz starts_at "обязательна вне черновика"
        timestamptz ends_at
        int capacity
        int seats_taken
        boolean registration_open
        timestamptz registration_deadline
        int schedule_version
        timestamptz published_at
        timestamptz cancelled_at
        varchar cancel_reason
        varchar location_city
        varchar location_venue
        boolean location_online
        text location_url "видна только участникам и организатору"
        text_array tags
    }
    registrations {
        bigint id PK
        bigint event_id FK
        bigint user_id FK
        text status "registered | attended | cancelled"
        timestamptz cancelled_at
        text cancelled_by "user | organizer | admin | system"
        varchar comment
        smallint legacy_tickets
    }
    reminders {
        bigint id PK
        bigint registration_id FK
        bigint user_id FK
        bigint event_id FK
        int offset_minutes
        timestamptz remind_at
        text kind "auto | custom"
        text status "pending | sent | cancelled | skipped"
        text cancel_reason
        int schedule_version
        timestamptz sent_at
    }
    notifications {
        bigint id PK
        bigint user_id FK
        text type
        bigint event_id FK
        bigint registration_id FK
        bigint reminder_id FK
        jsonb payload
        text dedup_key "уникален вместе с user_id"
        timestamptz read_at
    }
    messages {
        bigint id PK
        bigint event_id FK
        bigint user_id FK
        varchar author
        varchar text
        timestamptz deleted_at
    }
    favorites {
        bigint user_id PK, FK
        bigint event_id PK, FK
    }
```

## Ограничения и индексы, важные для логики

| Таблица | Правило | Как обеспечено |
|---|---|---|
| registrations | Не больше одной активной регистрации пользователя на мероприятие | частичный уникальный индекс `(event_id, user_id) WHERE status <> 'cancelled'` |
| registrations | Отмена всегда с отметкой времени | `CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))` |
| events | `0 ≤ seats_taken ≤ capacity` | CHECK; счетчик меняется атомарным UPDATE в транзакции регистрации |
| events | Опубликованное и отмененное мероприятие имеет дату начала; срок регистрации не позже начала; окончание позже начала | CHECK |
| reminders | Ожидающее напоминание привязано к регистрации; одно напоминание на смещение | CHECK `reminders_pending_has_registration`, частичный уникальный индекс `(registration_id, offset_minutes)` |
| notifications | Одно уведомление на событие для пользователя | UNIQUE `(user_id, dedup_key)`; ключи: `reminder:<id>:v<версия>`, `event:<id>:rescheduled:v<версия>`, `event:<id>:location:<время>`, `event:<id>:cancelled`, `registration:<id>:cancelled` |
| users | email обязателен, кроме удаленных; состояние согласовано с отметками времени | CHECK `users_email_unless_deleted`, `users_deleted_at_check`, `users_deactivated_check` |

Пользователь при удалении не удаляется из таблицы, а обезличивается, поэтому внешние ключи с `ON DELETE CASCADE` на `users` историю не стирают.
