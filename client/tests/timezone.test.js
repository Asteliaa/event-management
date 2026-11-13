// Проверки перевода «настенного» времени пояса мероприятия в момент (node --test, без зависимостей).
// Даты переходов: Europe/Berlin – 29.03.2026 02:00→03:00 и 25.10.2026 03:00→02:00;
// America/New_York – 08.03.2026 02:00→03:00 и 01.11.2026 02:00→01:00; Europe/Minsk – без перевода часов
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveZonedInput, fromZonedInput, toZonedInput, zonedInputIssue } from '../src/utils/format.js';

test('обычное время: туда и обратно без изменений', () => {
  for (const [value, tz, iso] of [
    ['2026-07-01T10:00', 'Europe/Minsk', '2026-07-01T07:00:00.000Z'],
    ['2026-01-15T09:30', 'Europe/Berlin', '2026-01-15T08:30:00.000Z'],
    ['2026-07-15T09:30', 'Europe/Berlin', '2026-07-15T07:30:00.000Z'],
    ['2026-12-31T23:30', 'Asia/Tokyo', '2026-12-31T14:30:00.000Z'],
    ['2026-03-08T12:00', 'America/New_York', '2026-03-08T16:00:00.000Z'],
  ]) {
    assert.deepEqual(resolveZonedInput(value, tz), { status: 'ok', iso });
    assert.equal(toZonedInput(iso, tz), value);
  }
});

test('несуществующее время весной: момент не выбирается, форма показывает ошибку', () => {
  for (const [value, tz] of [['2026-03-29T02:30', 'Europe/Berlin'], ['2026-03-08T02:15', 'America/New_York']]) {
    assert.deepEqual(resolveZonedInput(value, tz), { status: 'nonexistent', iso: null });
    assert.equal(fromZonedInput(value, tz), null);
    assert.match(zonedInputIssue(value, tz).error, /Такого времени нет/);
  }
  // граница: 03:00 в Берлине уже существует (летнее время)
  assert.deepEqual(resolveZonedInput('2026-03-29T03:00', 'Europe/Berlin'), { status: 'ok', iso: '2026-03-29T01:00:00.000Z' });
});

test('неоднозначное время осенью: выбирается первое наступление, второе – в alternative', () => {
  assert.deepEqual(resolveZonedInput('2026-10-25T02:30', 'Europe/Berlin'), {
    status: 'ambiguous', iso: '2026-10-25T00:30:00.000Z', alternative: '2026-10-25T01:30:00.000Z',
  });
  assert.deepEqual(resolveZonedInput('2026-11-01T01:30', 'America/New_York'), {
    status: 'ambiguous', iso: '2026-11-01T05:30:00.000Z', alternative: '2026-11-01T06:30:00.000Z',
  });
  const { hint, error } = zonedInputIssue('2026-10-25T02:30', 'Europe/Berlin');
  assert.equal(error, undefined);
  assert.match(hint, /GMT\+2.*GMT\+1/);
  // оба момента показываются как то же «настенное» время
  assert.equal(toZonedInput('2026-10-25T00:30:00.000Z', 'Europe/Berlin'), '2026-10-25T02:30');
  assert.equal(toZonedInput('2026-10-25T01:30:00.000Z', 'Europe/Berlin'), '2026-10-25T02:30');
});

test('пояс без перевода часов и пустое значение', () => {
  assert.equal(resolveZonedInput('2026-03-29T02:30', 'Europe/Minsk').status, 'ok');
  assert.equal(resolveZonedInput('2026-10-25T02:30', 'Europe/Minsk').status, 'ok');
  assert.deepEqual(resolveZonedInput('', 'Europe/Berlin'), { status: 'empty', iso: null });
  assert.deepEqual(zonedInputIssue('', 'Europe/Berlin'), {});
});
