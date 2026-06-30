const mockAxios = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(function() {
    return this;
  }),
  defaults: {
    headers: {}
  }
};

module.exports = mockAxios;