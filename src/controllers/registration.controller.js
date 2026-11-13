const registrationService = require('../services/registration.service');
const notify = require('../socket/notify');

const update = async (req, res) => res.json(await registrationService.update(req.params.id, req.user, req.body));

const cancel = async (req, res) => {
    const registration = await registrationService.cancel(req.params.id, req.user);
    if (registration.event) {
        notify.toRooms([notify.rooms.event(registration.event.id), ...notify.eventStaffRooms(registration.event)], 'registration:cancelled', {
            eventId: registration.event.id, title: registration.event.title, name: req.user.name
        });
    }
    res.json(registration);
};

module.exports = { update, cancel };
