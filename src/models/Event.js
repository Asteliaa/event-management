const { DataTypes, Model } = require('sequelize');
const { sequelize } = require('../db');
const { compact, ref } = require('./serialize');

const EVENT_TYPES = ['conference', 'webinar', 'meeting'];
const EVENT_STATUSES = ['published', 'cancelled'];

// Место проведения в API – вложенный объект location { city, venue, online, url },
// в таблице – отдельные столбцы location_*
const LOCATION_COLUMNS = { city: 'locationCity', venue: 'locationVenue', online: 'locationOnline', url: 'locationUrl' };

class Event extends Model {
    // Объект location из запроса → значения столбцов. Как и раньше, location заменяется целиком
    static locationToColumns(location) {
        const loc = location || {};
        return {
            locationCity: loc.city || null,
            locationVenue: loc.venue || null,
            locationOnline: Boolean(loc.online),
            locationUrl: loc.url || null
        };
    }

    get location() {
        return compact(Object.fromEntries(Object.entries(LOCATION_COLUMNS).map(([key, attr]) => [key, this.get(attr)])));
    }

    // Свободные места; null – вместимость не ограничена
    get seatsLeft() {
        const { capacity, seatsTaken } = this;
        if (capacity === undefined || capacity === null) return null;
        return Math.max(capacity - (seatsTaken || 0), 0);
    }

    get isPast() {
        return this.startsAt ? this.startsAt < new Date() : undefined;
    }

    toJSON() {
        const v = this.get({ plain: false });
        const json = {
            id: this.id === undefined ? undefined : String(this.id),
            title: v.title,
            description: v.description,
            type: v.type,
            status: v.status,
            category: ref(this, 'category', 'categoryId'),
            organizer: ref(this, 'organizer', 'organizerId'),
            startsAt: v.startsAt,
            endsAt: v.endsAt,
            coverUrl: v.coverUrl,
            capacity: v.capacity,
            seatsTaken: v.seatsTaken,
            location: Object.values(LOCATION_COLUMNS).some((a) => a in this.dataValues) ? this.location : undefined,
            tags: v.tags,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt
        };
        if ('capacity' in this.dataValues) json.seatsLeft = this.seatsLeft;
        if ('startsAt' in this.dataValues) json.isPast = this.isPast;
        return { ...compact(json), ...('seatsLeft' in json && { seatsLeft: json.seatsLeft }) };
    }
}

Event.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(150), allowNull: false, set(v) { this.setDataValue('title', typeof v === 'string' ? v.trim() : v); } },
    description: { type: DataTypes.STRING(5000), allowNull: false, defaultValue: '' },
    type: { type: DataTypes.TEXT, allowNull: false, validate: { isIn: [EVENT_TYPES] } },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'published', validate: { isIn: [EVENT_STATUSES] } },
    categoryId: { type: DataTypes.BIGINT },
    organizerId: { type: DataTypes.BIGINT },
    startsAt: { type: DataTypes.DATE, allowNull: false },
    endsAt: { type: DataTypes.DATE },
    coverUrl: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    // capacity = null – мест без ограничений
    capacity: { type: DataTypes.INTEGER, validate: { min: 1 } },
    // счетчик занятых мест меняется только в транзакциях вместе с регистрациями (services/registration.service.js);
    // БД дополнительно проверяет 0 <= seats_taken <= capacity
    seatsTaken: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
    locationCity: { type: DataTypes.STRING(80) },
    locationVenue: { type: DataTypes.STRING(150) },
    locationOnline: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    locationUrl: { type: DataTypes.TEXT },
    tags: {
        type: DataTypes.ARRAY(DataTypes.TEXT),
        allowNull: false,
        defaultValue: [],
        set(v) { this.setDataValue('tags', (v || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean)); }
    }
}, { sequelize, modelName: 'Event', tableName: 'events' });

Event.EVENT_TYPES = EVENT_TYPES;
Event.EVENT_STATUSES = EVENT_STATUSES;

module.exports = Event;
