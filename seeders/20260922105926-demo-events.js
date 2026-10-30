'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.bulkInsert('Events', [
      {
        title: 'Конференция разработчиков 2026',
        type: 'conference',
        date: new Date('2026-10-15'),
        description: 'Масштабная IT-конференция',
        capacity: 500,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        title: 'Вебинар: Введение в Sequelize',
        type: 'webinar',
        date: new Date('2026-11-05'),
        description: 'Изучаем ORM на практике',
        capacity: 100,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('Events', null, {});
  }
};