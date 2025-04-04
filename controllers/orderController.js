import  Order  from '../config/db.js';

export const createOrder = async (req, res) => {
  try {
    if (!req.body.order_number || !req.body.dispatcher_name || !req.body.customer_name) {
      return res.status(400).json({ error: 'Missing required fields: order number, dispatcher name, and customer name are required' });
    }

    const orderDetails = req.body.order_details || {};
    const hasItems =
      (orderDetails.glass && orderDetails.glass.length > 0) ||
      (orderDetails.caps && orderDetails.caps.length > 0) ||
      (orderDetails.boxes && orderDetails.boxes.length > 0) ||
      (orderDetails.pumps && orderDetails.pumps.length > 0);

    if (!hasItems) {
      return res.status(400).json({ error: 'Order must contain at least one item (glass, caps, boxes, or pumps)' });
    }

    const newOrder = new Order(req.body);
    const savedOrder = await newOrder.save();

    res.status(201).json({
      success: true,
      message: '✅ Order Created Successfully',
      order: savedOrder
    });
  } catch (error) {
    console.error('Order creation error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Order number already exists' });
    }
    res.status(500).json({ error: error.message });
  }
};



export const filterOrders = async (req, res) => {
  try {
    const { orderType } = req.params;
    const { team } = req.query;

    if (!team) {
      return res.status(400).json({ error: 'Team parameter is required' });
    }

    const teamMapping = {
      glass: 'order_details.glass',
      cap: 'order_details.caps',
      box: 'order_details.boxes',
      pump: 'order_details.pumps'
    };

    const teamKey = Object.keys(teamMapping).find(key => team.toLowerCase().includes(key));
    if (!teamKey) {
      return res.status(400).json({ error: 'Invalid team type' });
    }

    const teamField = teamMapping[teamKey];

    const orderStatus = orderType === 'liveOrders' ? 'Pending' : 'Completed';

    const filteredOrders = await Order.find(
      {
        order_status: orderStatus,
        [`${teamField}.0`]: { $exists: true }
      },
      {
        order_number: 1,
        dispatcher_name: 1,
        customer_name: 1,
        createdAt: 1,
        order_status: 1,
        [teamField]: 1
      }
    );

    res.json({ orders: filteredOrders });
  } catch (error) {
    console.error('Error filtering orders:', error);
    res.status(500).json({ error: error.message });
  }
};




export const updateOrderProgress = async (req, res) => {
  try {
    const { order_number, team_type, updates } = req.body;
    
    if (!order_number || !team_type || !updates || !Array.isArray(updates)) {
      return res.status(400).json({ 
        error: 'Invalid request. Required: order_number, team_type, and updates array' 
      });
    }

    const order = await Order.findOne({ order_number });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const validTeamTypes = ['glass', 'caps', 'boxes', 'pumps'];
    if (!validTeamTypes.includes(team_type)) {
      return res.status(400).json({ error: 'Invalid team type' });
    }

    const teamItems = order.order_details[team_type];

    updates.forEach(update => {
      const itemToUpdate = teamItems.find(
        item => item._id.toString() === update.item_id
      );

      if (!itemToUpdate) {
        console.warn(`Item ${update.item_id} not found in order`);
        return;
      }

      const maxAllowedQty = itemToUpdate.quantity - (itemToUpdate.team_tracking?.total_completed_qty || 0);
      if (update.qty_completed > maxAllowedQty) {
        throw new Error(`Quantity exceeded for item ${update.item_id}. Max allowed: ${maxAllowedQty}`);
      }

      if (!itemToUpdate.team_tracking) {
        itemToUpdate.team_tracking = {
          total_completed_qty: update.qty_completed,
          completed_entries: [{ 
            qty_completed: update.qty_completed,
            timestamp: new Date()
          }],
          status: update.qty_completed >= itemToUpdate.quantity ? 'Completed' : 'Pending'
        };
      } else {
        
        itemToUpdate.team_tracking.total_completed_qty += update.qty_completed;
        itemToUpdate.team_tracking.completed_entries.push({
          qty_completed: update.qty_completed,
          timestamp: new Date()
        });
        
        itemToUpdate.team_tracking.status = 
          itemToUpdate.team_tracking.total_completed_qty >= itemToUpdate.quantity 
            ? 'Completed' : 'Pending';
      }
    });

    const isOrderCompleted = Object.values(order.order_details).every(items => 
      items.every(item => 
        item.team_tracking?.status === 'Completed' || item.team_tracking?.status === undefined
      )
    );
    if (isOrderCompleted) {
      order.order_status = 'Completed';
    }

    await order.save();
    res.json({ 
      success: true, 
      message: 'Order progress updated successfully',
      order 
    });
  } catch (error) {
    console.error('Order progress update error:', error);
    res.status(500).json({ error: error.message });
  }
};


export const getOrders = async (req, res) => {
  try {
    const orders = await Order.find();
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};






