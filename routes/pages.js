/**
 * Маршруты страниц.
 *   GET  /            – список мероприятий
 *   GET  /item/:id    – детальная страница
 *   GET  /add         – форма добавления (только организатор)
 *   POST /add         – добавление в базу данных и редирект на главную
 *   GET  /login       – страница входа (имитация)
 *   GET  /logs        – журнал запросов из файла logs/requests.log (только организатор)
 */
const express = require('express');
const ctrl = require('../controllers/eventController');
const { requireAuth, safeNext } = require('../middleware/auth');
const { methodNotAllowed } = require('../middleware/errors');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.route('/')
  .get(asyncHandler(ctrl.list))
  .all(methodNotAllowed('GET, HEAD'));

router.route('/item/:id')
  .get(asyncHandler(ctrl.detail))
  .all(methodNotAllowed('GET, HEAD'));

// Несколько middleware подряд для одного маршрута: сначала проверка доступа,
// затем разбор формы, затем контроллер
router.route('/add')
  .get(requireAuth, ctrl.showForm)
  .post(requireAuth, express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 30 }), asyncHandler(ctrl.create))
  .all(methodNotAllowed('GET, HEAD, POST'));

router.route('/login')
  .get((req, res) => {
    res.render('login', { title: 'Вход', nextPath: safeNext(req.query.next) });
  })
  .all(methodNotAllowed('GET, HEAD'));

// Журнал запросов: асинхронное чтение файла, ошибки – через asyncHandler в next(err)
router.route('/logs')
  .get(requireAuth, asyncHandler(ctrl.logs))
  .all(methodNotAllowed('GET, HEAD'));

module.exports = router;
