function presentExternalBooking(booking) {
  return {
    success: true,
    bookingReference: booking.bookingReference,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    guests: booking.guests,
    serviceName: booking.serviceName,
    status: booking.status,
    tables: (booking.tables || []).map((table) => ({
      tableNumber: table.tableNumber,
      capacity: table.capacity,
    })),
  };
}

function presentAvailability(availability) {
  const recommendations = (availability.recommendations || []).slice(0, 3).map((table) => ({
    tableNumber: table.tableNumber,
    capacity: table.capacity,
  }));

  return {
    success: Boolean(availability.available),
    available: Boolean(availability.available),
    service: availability.serviceName || null,
    endTime: availability.endTime || null,
    reason: availability.available ? null : availability.reason || null,
    recommendedTables: recommendations,
  };
}

function spokenFailure(code, message) {
  if (code === 'PAYMENT_REQUIRED') {
    return 'A deposit is required. This channel cannot collect it, so the reservation was not created.';
  }
  if (code === 'CUSTOMER_BLACKLISTED') {
    return 'This customer is restricted from new reservations. Please contact the restaurant.';
  }
  if (code === 'RESTAURANT_CLOSED') {
    return 'The restaurant is closed at that time.';
  }
  if (code === 'NO_SUITABLE_TABLE') {
    return 'No suitable table is available at that time.';
  }
  return message || 'The reservation could not be completed.';
}

function presentFailure(error) {
  const code = error.code || 'BAD_REQUEST';
  return {
    success: false,
    code,
    result: spokenFailure(code, error.message),
  };
}

module.exports = {
  presentExternalBooking,
  presentAvailability,
  presentFailure,
  spokenFailure,
};
