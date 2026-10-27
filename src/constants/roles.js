const ROLES = Object.freeze({
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
});

const ROLE_LIST = Object.freeze(Object.values(ROLES));

module.exports = {
  ROLES,
  ROLE_LIST,
};
