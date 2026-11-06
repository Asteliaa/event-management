const categoryService = require('../services/category.service');

const list = async (req, res) => res.json(await categoryService.list());
const create = async (req, res) => res.status(201).json(await categoryService.create(req.body));
const update = async (req, res) => res.json(await categoryService.update(req.params.id, req.body));

const remove = async (req, res) => {
    await categoryService.remove(req.params.id);
    res.status(204).send();
};

module.exports = { list, create, update, remove };
