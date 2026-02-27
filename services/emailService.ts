import { supabase } from '../lib/supabase';

interface BookingEmailData {
  booking: {
    start_date: string;
    end_date: string;
    guest_count: number;
    total_price: number;
    special_requests?: string;
  };
  user: {
    id: string;
    email: string;
    full_name: string | null;
    phone_number: string | null;
  };
  property: {
    id: string;
    title: string;
  };
}

export class EmailNotificationService {
  private static async getAdminProfile() {
    try {
      const { data: adminProfile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .limit(1)
        .single();

      if (error) {
        console.warn('No admin profile found, using defaults');
        return {
          email: 'admin@surfhousebaja.com',
          full_name: 'Property Manager',
          phone_number: null
        };
      }

      return adminProfile;
    } catch (error) {
      console.error('Failed to load admin profile:', error);
      return {
        email: 'admin@surfhousebaja.com',
        full_name: 'Property Manager',
        phone_number: null
      };
    }
  }

  static async sendBookingRequestEmail(data: BookingEmailData) {
    try {
      console.log('=== EMAIL SERVICE: sendBookingRequestEmail called ===');
      console.log('Data:', JSON.stringify(data, null, 2));
      
      const adminProfile = await this.getAdminProfile();
      console.log('Admin profile:', adminProfile);

      const { data: response, error } = await supabase.functions.invoke('send-booking-email', {
        body: {
          type: 'booking_request',
          booking: data.booking,
          user: data.user,
          property: data.property,
          adminEmail: adminProfile.email,
          adminName: adminProfile.full_name || 'Property Manager',
          adminPhone: adminProfile.phone_number,
        },
      });

      console.log('Supabase function response:', response);
      console.log('Supabase function error:', error);
      
      if (error) {
        throw error;
      }

      return response;
    } catch (error) {
      console.error('Email service error:', error);
      throw error;
    }
  }

  static async sendBookingConfirmationEmail(data: BookingEmailData) {
    try {
      const adminProfile = await this.getAdminProfile();

      const { data: response, error } = await supabase.functions.invoke('send-booking-email', {
        body: {
          type: 'booking_confirmed',
          booking: data.booking,
          user: data.user,
          property: data.property,
          adminEmail: adminProfile.email,
          adminName: adminProfile.full_name || 'Property Manager',
          adminPhone: adminProfile.phone_number,
        },
      });

      if (error) {
        throw error;
      }

      return response;
    } catch (error) {
      console.error('Email service error:', error);
      throw error;
    }
  }

  static async sendBookingDenialEmail(data: BookingEmailData & { denialReason?: string }) {
    try {
      const adminProfile = await this.getAdminProfile();

      const { data: response, error } = await supabase.functions.invoke('send-booking-email', {
        body: {
          type: 'booking_denied',
          booking: data.booking,
          user: data.user,
          property: data.property,
          adminEmail: adminProfile.email,
          adminName: adminProfile.full_name || 'Property Manager',
          adminPhone: adminProfile.phone_number,
          denialReason: data.denialReason,
        },
      });

      if (error) {
        throw error;
      }

      return response;
    } catch (error) {
      console.error('Email service error:', error);
      throw error;
    }
  }
}