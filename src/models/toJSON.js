// Общие настройки вывода документа в JSON: _id → id, без служебного __v
module.exports = {
    virtuals: true,
    versionKey: false,
    transform: (doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
    }
};
