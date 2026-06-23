const mongoose = require('mongoose');

const RegistrationSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    phone: { type: String, required: true, trim: true },
    country: { type: String, required: true, default: 'Ghana', trim: true },
    church: { type: String, required: true, trim: true },
    churchRole: {
      type: String,
      required: true,
      enum: ['Pastor', 'Church worker', 'Leader', 'Member', 'Other'],
    },
    attendanceType: { type: String, required: true, enum: ['ghana-center'], default: 'ghana-center' },
    paymentMethod: { type: String, required: true, enum: ['momo'], default: 'momo' },
    momoReference: { type: String, unique: true, sparse: true, trim: true },
    momoTransactionId: { type: String, trim: true },
    status: {
      type: String,
      required: true,
      enum: [
        'awaiting-momo-payment',
        'momo-review-pending',
        'momo-paid',
        'payment-not-confirmed',
      ],
    },
    paymentReviewedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Registration', RegistrationSchema);
